# Redis Study Notes

My hands-on journey learning **Redis from scratch**, targeting the current version (**Redis 8.x**).
Every topic is practiced in `redis-cli` (and now in Node.js + TypeScript) and backed by interview-style questions.

## Why Redis

Redis is an in-memory data store used for caching, sessions, rate limiting, leaderboards, queues and messaging.
I'm learning it as part of my full-stack and DevOps path: building scalable apps that handle load well.

## Setup

```bash
docker run -d --name my-redis -p 6379:6379 -v redis-data:/data redis:8 redis-server --appendonly yes
docker exec -it my-redis redis-cli
PING   # -> PONG
```

## Folder Structure

```
Redis-Interview-Collections/
├── .gitignore                  # ignores node_modules/, .env, logs, dist/
├── README.md
├── redis-interview-1.md        # Day 1
├── redis-interview-2.md        # Day 2
└── redis-interview-3/          # Day 3
    ├── redis-interview-3.md
    └── nodejs-intigration/
        ├── package.json
        ├── package-lock.json
        └── server.ts
```

## Files

| File                                                                                               | Covers                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [redis-interview-1.md](./redis-interview-1.md)                                                     | Basics, Strings, Lists, Hashes, Sets, Sorted Sets, key listing (KEYS vs SCAN), Redis JSON, Streams, common mistakes, interview answers                                  |
| [redis-interview-2.md](./redis-interview-2.md)                                                     | Redis JSON, Streams and consumer groups (with practice output), Persistence (RDB vs AOF), Docker persistence gotchas, interview answers                                 |
| [redis-interview-3/redis-interview-3.md](./redis-interview-3/redis-interview-3.md)                 | Cache-aside pattern, why DEL beats SET on update (race conditions), TTL, eviction policies, node-redis v6 setup, server.ts walkthrough, real timings, interview answers |
| [redis-interview-3/nodejs-intigration/server.ts](./redis-interview-3/nodejs-intigration/server.ts) | Express + TypeScript API using cache-aside with Redis (GET cached product, PUT price with cache invalidation)                                                           |

## Run the Node.js Demo

```bash
cd redis-interview-3/nodejs-intigration
npm install
npm run start          # -> Connected to Redis, Server running on http://localhost:3000
```

```bash
curl http://localhost:3000/product/1   # 1st call: database (~500 ms)
curl http://localhost:3000/product/1   # 2nd call: cache (~1 ms)
```

> Requires `"type": "module"` in package.json (top-level await).

## Progress

**Pace:** 3–4 focused hours a day, about 7–8 days in total.

- [x] **Day 1:** Redis basics, Docker setup, expiry, atomic counters, and all 5 core data types
- [x] **Day 2:** Redis JSON, Streams and consumer groups, Persistence (RDB vs AOF)
- [x] **Day 3:** Caching patterns, eviction policies, Node.js + TypeScript integration
- [ ] **Day 4:** Pub/Sub (practiced), queues, transactions, Lua scripts
- [ ] **Day 5:** Security (ACL), replication, Sentinel
- [ ] **Day 6:** Cluster, Docker Compose production setup, monitoring
- [ ] **Day 7–8:** Mini project: an API with caching and a rate limiter

## How I study

1. **Learn the concept:** what it is and when to use it.
2. **Practice every command myself** in `redis-cli` (no copy-paste).
3. **Answer a "why" question** for each topic in one line, interview-style.
4. **Log my mistakes** so I don't repeat them.
5. **Revise** previous topics from memory before starting a new one.

## Key concepts so far

- **Atomicity:** commands like `INCR` and `HINCRBY` update data in one step, which avoids race conditions.
- **Right data type for the job:** Hash for flat objects, JSON for nested data, Sorted Set for rankings, Stream for reliable event processing.
- **Production safety:** use `SCAN` instead of `KEYS`; Redis data is in RAM and needs persistence.
- **Persistence:** RDB snapshots plus AOF write log, both on in production, with a Docker volume so data survives `docker rm`.
- **Caching:** cache-aside reads; on update, write the DB then **DEL** the cache key; every cache key gets a TTL; use `allkeys-lru` for a pure cache.
- **Redis is not the source of truth:** the database is. Redis is a fast copy that can be rebuilt.

## Resources

- [Redis documentation](https://redis.io/docs/latest/)
- [Redis commands reference](https://redis.io/docs/latest/commands/)
- [node-redis guide](https://redis.io/docs/latest/develop/clients/nodejs/)
