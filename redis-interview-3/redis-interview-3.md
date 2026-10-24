# Redis Interview 3 — Caching Patterns + Node.js (TypeScript) Integration

> Redis 8.x · node-redis v6 · Express 5 · TypeScript · Day 3 notes

---

## 1. Why cache at all?

A database read can take hundreds of milliseconds. Redis keeps data **in memory**, so it answers in about **1 ms**.
In my own test: **database = ~506 ms, cache = ~1 ms**, roughly 500x faster.

Caching protects the database from repeated reads of the same data (product pages, prices, profiles).

---

## 2. Cache-Aside Pattern (Lazy Loading)

The most common caching pattern. The **application** manages the cache, not Redis.

**Read flow**
1. Check Redis for the key (`product:1`).
2. **Hit**: return the cached value.
3. **Miss**: read from the database, store the result in Redis **with a TTL**, return it.

**Write flow (invalidation)**
1. Update the **database** first (the source of truth).
2. **DEL** the cache key.
3. The next read is a miss, so it fetches fresh data and re-caches it.

```
Client -> App -> Redis? --hit--> return
                   |
                  miss
                   v
                Database -> SET key EX 300 -> return
```

---

## 3. Why DEL instead of SET on update? (Interview favourite)

**Race condition example:**
- Request A updates the price to **16000**, and request B updates it to **18000** right after.
- The database ends at **18000** (correct).
- A's server is slow, so the cache writes land in reverse: B sets 18000, then A's late SET overwrites it with **16000**.
- Now DB = 18000 and cache = 16000, so customers see a **stale** price until the TTL expires. The app always checks the cache first, so the wrong value wins.

**With DEL:** both requests just delete the key. The order doesn't matter, and the next read pulls 18000 from the DB.

**Bonus:** DEL doesn't waste memory caching data nobody may read.

> ❌ My wrong first answer: "SET takes extra space / it's about allkeys-lru."
> SET overwrites the same key (no extra space), and LRU is about **eviction**, not **invalidation**.

---

## 4. TTL: the safety net

`SET product:1 '{...}' EX 300` makes the key expire after 300 seconds.

- If an invalidation is ever missed, stale data lives **at most** 5 minutes.
- Seen in my test: `product:1` disappeared from `KEYS *` after 300 s, and the next call went to the database.

**Rule:** every cache key gets a TTL.

---

## 5. Eviction Policies (when memory is full)

Set a memory limit with `maxmemory` (e.g. `CONFIG SET maxmemory 100mb`).

| Policy | Behaviour |
|---|---|
| `noeviction` (default) | Rejects new **writes** with an error once memory is full |
| `allkeys-lru` | Removes the **least** recently used key (any key) and keeps serving |
| `volatile-lru` | Removes the least recently used key **only among keys with a TTL** |

- For a pure cache, use **allkeys-lru**.
- `noeviction` is **not** a memory leak. Memory is capped, but new writes fail.
- LRU removes the **least** recently used key, not the most recent.

---

## 6. Node.js Client Choice

| Client | Status |
|---|---|
| **node-redis** (`npm install redis`) | Official, v6 (RESP3 by default), recommended for new projects |
| ioredis | Older; Redis itself recommends node-redis for new projects |

node-redis ships its **own TypeScript types**. Do **not** install `@types/redis` (outdated).

---

## 7. Project Setup (TypeScript)

```bash
npm init -y
npm install redis express
npm install -D typescript tsx @types/express @types/node
```

**package.json essentials**
```json
{
  "type": "module",
  "scripts": {
    "start": "npx tsx server.ts"
  }
}
```

> ⚠️ `"type": "module"` is required. `server.ts` uses **top-level await** (`await redis.connect()`), which fails in CommonJS.

Make sure Redis is running:
```bash
docker ps
docker start my-redis   # if it's stopped
```
Prefer pinning the image: `redis:8` instead of `redis:latest`.

---

## 8. How server.ts Works (section by section)

The full code is in `nodejs-intigration/server.ts`.

**a) Product type**
`type Product = { id: number; name: string; price: number }` gives typed data everywhere.

**b) Fake database**
An in-memory object plus `sleep(500)` to simulate a slow DB. `findProduct` and `updatePrice` are async like a real DB driver.

**c) Redis client**
```ts
const redis = createClient({ url: "redis://localhost:6379" });
redis.on("error", (err) => console.error("Redis error:", err));
await redis.connect();
```
Always attach an `error` listener. Without one, a connection error can crash the process.

**d) getProduct (cache-aside read)**
- `redis.get(key)` returns `string | null`.
- Hit: `JSON.parse(cached) as Product`, source `"cache"`.
- Miss: DB read, then `redis.set(key, JSON.stringify(product), { EX: 300 })`, source `"database"`.
- Redis stores **strings**, so objects are `JSON.stringify`'d in and `JSON.parse`'d out.

> `as Product` only tells the compiler what to expect. It does **not** validate at runtime. In production, validate with a library like **Zod**.

**e) GET /product/:id**
Measures the time, logs the source, returns `{ source, ms, product }`, with 404 if not found and 500 on errors.

**f) PUT /product/:id/price (invalidation)**
`db.updatePrice(...)` first, then `redis.del("product:<id>")`. That's update DB, then DEL cache.

**g) app.listen**
Logs `Server running on http://localhost:3000`. A running server looks "stuck" in the terminal. It's just waiting for requests.

---

## 9. Testing It

```bash
curl http://localhost:3000/product/1
curl http://localhost:3000/product/1
curl -X PUT http://localhost:3000/product/1/price -H "Content-Type: application/json" -d '{"price": 18000}'
curl http://localhost:3000/product/1
```

**My actual results**

| Step | Source | Time |
|---|---|---|
| 1st GET | database | 506 ms |
| 2nd GET | cache | 1 ms |
| PUT price 18000 | DB updated + cache deleted | — |
| GET after PUT | database (fresh 18000) | 510 ms |
| GET again | cache | 2 ms |
| GET after 300 s | database (TTL expired) | 507 ms |

---

## 10. Errors I Hit (and fixes)

| Error | Cause | Fix |
|---|---|---|
| Terminal looked "stuck" | Server running with no startup log | Add a log in the `app.listen` callback |
| `Top-level await is currently not supported with the "cjs" output format` | `"type": "commonjs"` in package.json | Change to `"type": "module"` (or wrap in `async main()`) |
| `clar`, `pm`, `public` | Typos | Slow down. In production a typo'd key returns `null` silently |

> Production habit: use `SCAN 0 MATCH product:*` instead of `KEYS *` (KEYS blocks Redis).

---

## 11. Interview Q&A

**Q1. What is cache-aside?**
The app checks the cache first. On a miss it reads the DB, writes the result to the cache with a TTL, and returns it.

**Q2. Why delete the cache key on update instead of setting the new value?**
Concurrent updates can write to the cache out of order and leave a stale value. DEL can't store a wrong value. The next read fetches fresh data.

**Q3. Why put a TTL on cache keys?**
It's a safety net. Even if invalidation fails, stale data expires automatically.

**Q4. noeviction vs allkeys-lru?**
noeviction rejects writes when memory is full. allkeys-lru removes the least recently used keys and keeps serving. For a cache, use allkeys-lru.

**Q5. Is Redis the source of truth?**
No. The database is. Redis is a fast copy that can be deleted and rebuilt at any time.

**Q6. Why node-redis over ioredis?**
It's the official client, actively maintained, has built-in TypeScript types, and supports new Redis 8 features.

---

## 12. Key Takeaways

- Read: cache, then on a miss the DB, then cache it with a TTL.
- Write: update the DB, then **DEL** the cache.
- Every key gets a **TTL**.
- For a cache, use **allkeys-lru**.
- Use `"type": "module"` for top-level await.
- Redis is a cache, not the source of truth.
