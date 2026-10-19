# Redis Revision Notes

Last updated: 2026-10-19 · Target version: Redis 8.x (latest line 8.10 as of Sept 2026)

---

## Lesson 1: Redis basics

Redis is an in-memory key-value data store, so reads and writes take well under a millisecond. Values can be strings, lists, hashes, sets, sorted sets, streams or JSON.

**Common uses:** caching, sessions, rate limiting, leaderboards, queues, pub/sub.

**What changed in Redis 8:** JSON, search, time series and probabilistic types are now built into core Redis. You no longer install a separate "Redis Stack". Redis 8 also added AGPLv3 as a license option.

**Run it with Docker**

```bash
docker run -d --name redis -p 6379:6379 redis:8
docker exec -it redis redis-cli
PING            # -> PONG
```

**Core commands**

```
SET name "Manish"     # store
GET name              # read -> "Manish"
EXISTS name           # 1 = exists, 0 = not
DEL name              # delete
SET otp 4821 EX 60    # store with 60s expiry
TTL otp               # seconds left
INCR visits           # atomic counter: 1, 2, 3...
```

**Atomicity (key idea):** INCR reads, adds and saves in one indivisible step. GET, then +1 in code, then SET can lose updates when two clients run at once. That bug is a race condition.

**Warning:** data lives in RAM. Without persistence (RDB/AOF), a restart can lose it. Do not use Redis as your only database by default.

---

## Strings

One key holds one value: text, a number, or serialized JSON. Max size is 512 MB.

```
SET user:1:name "Manish"
GET user:1:name               # "Manish"
SET page:views 10
INCRBY page:views 5           # 15
DECR page:views               # 14
APPEND user:1:name " Zond"    # "Manish Zond"
STRLEN user:1:name            # 11
MSET a 1 b 2                  # set many
MGET a b                      # 1, 2
SET lock:order1 "x" NX EX 10  # set only if missing (simple lock)
```

**Used for:** caching, counters, OTPs, simple locks.

**Naming convention:** `object:id:field`, for example `user:1:name` or `product:1`.

---

## Lists

An ordered sequence of strings. You push and pop from both ends.

```
RPUSH tasks "email" "build" "deploy"   # add to end
LPUSH tasks "urgent"                    # add to start
LRANGE tasks 0 -1     # all items (-1 = last)
LPOP tasks            # removes "urgent"
RPOP tasks            # removes "deploy"
LLEN tasks            # length
LTRIM tasks 0 99      # keep first 100 only
BLPOP jobs 5          # wait up to 5s for an item
```

**Queue pattern (FIFO):** RPUSH to add, LPOP to process. First in, first out.

**Used for:** simple queues, recent activity feeds, latest-N logs.

**Gotcha:** accessing the middle of a big list is slow (O(N)). Lists are fast only at the ends.

---

## Hashes

One key holds many field-value pairs, like an object.

```
HSET product:1 name "bottle" price 100 stock 2
HGET product:1 name           # "bottle"
HGETALL product:1             # all fields + values
HMGET product:1 name price
HINCRBY product:1 stock -1    # 1 (use -1 to decrease)
HDEL product:1 price
HEXISTS product:1 price       # 0
HKEYS product:1 / HVALS product:1
```

**Per-field expiry (Redis 7.4+, current in Redis 8):**

```
HSET session:1 token "abc" cart "3 items"
HEXPIRE session:1 60 FIELDS 1 token   # only token expires in 60s
HTTL session:1 FIELDS 1 token
```

**Used for:** user profiles, sessions, product details.

**String vs Hash:** with a JSON string you must read the whole object, parse it, change it and write it all back. That is slow and causes race conditions. With a hash, HSET or HINCRBY changes one field atomically inside Redis.

**Rule:** store plain numbers only. `"100rs"` breaks HINCRBY; store `100`.

---

## Sets

An unordered collection of unique strings. Duplicates are ignored silently.

```
SADD ids 101 102 101      # 2 (duplicate ignored)
SCARD ids                 # 2
SMEMBERS ids              # 101, 102
SISMEMBER ids 101         # 1 (fast check)
SREM ids 102

SADD user:1:skills node redis
SADD user:2:skills redis aws
SINTER user:1:skills user:2:skills   # redis (common)
SUNION user:1:skills user:2:skills   # node, redis, aws
SDIFF  user:1:skills user:2:skills   # node (only in user 1)
```

**Used for:** unique visitors, tags, "already liked" checks, mutual friends.

---

## Sorted Sets (ZSET)

Like a set, but every member has a score, and Redis keeps members sorted by score.

```
ZADD leaderboard 1 manish 2 minal 3 mitesh 4 rohan
ZRANGE leaderboard 0 -1 WITHSCORES       # lowest to highest
ZRANGE leaderboard 0 1 REV WITHSCORES    # top 2: rohan 4, mitesh 3
ZINCRBY leaderboard 50 manish            # 51
ZSCORE leaderboard rohan                 # 4
ZRANK leaderboard manish                 # position, 0-based
ZRANGE leaderboard 1 3 BYSCORE           # members with score 1-3
ZREM leaderboard minal
```

**Current syntax:** ZRANGE with REV and BYSCORE replaces the deprecated ZREVRANGE and ZRANGEBYSCORE.

**Used for:** leaderboards, rankings, priority queues, rate limiting with timestamps as scores.

**Why not a List for a leaderboard:** a sorted set stays sorted automatically, keeps players unique, and updates a score fast with ZINCRBY. A list has no scores, allows duplicates, and needs manual searching and re-sorting.

---

## Choosing a data type

Pick the type by what you need to do with the data, not by what feels familiar.

| Need                             | Type       | Example               |
| -------------------------------- | ---------- | --------------------- |
| Single value or counter          | String     | OTP, page views       |
| Ordered queue                    | List       | simple job queue      |
| Flat object with fields          | Hash       | session, user profile |
| Unique items, membership check   | Set        | unique visitors, tags |
| Ranking by a number              | Sorted Set | leaderboard           |
| Nested object or arrays          | JSON       | order with items      |
| Reliable event log, many workers | Stream     | order processing      |

**Listing keys**

```
KEYS *                          # all keys - local/dev only
SCAN 0 MATCH user:* COUNT 100   # production-safe, in batches
DBSIZE                          # total key count
TYPE user:1                     # hash / list / string ...
```

KEYS blocks Redis while it scans everything, so never use it in production. SCAN returns a cursor; repeat with that cursor until it returns 0.

---

## Redis JSON

Built into Redis 8. It stores real nested JSON and updates one path at a time. `$` means the root of the document.

```
JSON.SET order:1 $ '{"customer":"minal","total":10000,"items":["bag","pant"]}'
JSON.GET order:1                       # whole document
JSON.GET order:1 $.total               # [10000]
JSON.SET order:1 $.total 9000          # update one field
JSON.NUMINCRBY order:1 $.total 500     # atomic increment
JSON.ARRAPPEND order:1 $.items '"LV Jacket"'
JSON.DEL order:1 $.items
JSON.TYPE order:1 $.total              # integer
```

**Most common mistake:** a JSON string value needs its own double quotes inside single quotes: `'"LV Jacket"'`. Without them Redis rejects it as invalid JSON.

| Hash                     | JSON                               |
| ------------------------ | ---------------------------------- |
| Flat data only           | Nested objects and arrays          |
| Lighter, slightly faster | More flexible                      |
| Session, counters        | Order with items, product variants |

**Rule:** flat data uses a hash; nested data uses JSON.

---

## Streams and consumer groups

A stream is an append-only log of events. Each entry gets an auto ID (timestamp-sequence) and stays until deleted.

```
XADD orders * product "saree" qty 2    # * = auto ID
XLEN orders
XRANGE orders - +                      # all entries
XREAD COUNT 10 STREAMS orders 0        # read from start
XREAD BLOCK 5000 STREAMS orders $      # wait 5s for new entries
```

**Consumer groups:** several workers share the work; each message goes to one worker.

```
XGROUP CREATE orders workers $ MKSTREAM
XREADGROUP GROUP workers w1 COUNT 1 STREAMS orders >   # > = new messages
XACK orders workers <id>               # mark processed
XPENDING orders workers                # taken but not ACKed
```

If a worker crashes before XACK, the message stays pending and can be reassigned. Nothing is lost.

| List queue                              | Stream                        |
| --------------------------------------- | ----------------------------- |
| LPOP removes the item; a crash loses it | Entry stays until ACKed       |
| One consumer per item                   | Consumer groups, many workers |
| No history                              | Replayable history            |

**Used for:** order processing, event logs, notifications, messaging between microservices.

---

## Common mistakes and interview answers

**Mistakes made so far**

- Storing `"100rs"` instead of `100`, so HINCRBY fails.
- Using `users:1` as a key for a product; name keys by what they hold (`product:1`).
- Typing `zrang` instead of `ZRANGE`.
- Forgetting inner quotes in `JSON.ARRAPPEND`.
- Using `KEYS *` in production.

**One-line interview answers**

1. **Why INCR over GET + SET?** INCR is atomic, so concurrent clients cannot overwrite each other. GET + SET causes race conditions.
2. **Why HINCRBY over a JSON string?** It updates one field atomically inside Redis, with no read-parse-write cycle.
3. **Why a Sorted Set for a leaderboard?** It stays sorted by score, keeps members unique, and updates scores fast.
4. **Hash or JSON for a session?** Hash: the data is flat, and HEXPIRE can expire just the token field.
5. **Why is KEYS dangerous?** It blocks Redis while scanning every key; use SCAN.
6. **Why a Stream over a List for payments?** _To be answered._

---

## Study plan and progress

Plan: 3 to 4 focused hours a day, about 7 to 8 days. Tick each item only after the hands-on task is done.

- [x] Day 1: basics + Strings, Lists, Hashes, Sets, Sorted Sets
- [ ] Day 2: JSON (done), Streams (task pending), Persistence RDB vs AOF
- [ ] Day 3: caching patterns, eviction policies, Node.js integration
- [ ] Day 4: Pub/Sub, queues, transactions, Lua scripts
- [ ] Day 5: security (ACL) + replication, Sentinel
- [ ] Day 6: Cluster, Docker Compose production setup, monitoring
- [ ] Day 7-8: mini project, an API with caching and a rate limiter
