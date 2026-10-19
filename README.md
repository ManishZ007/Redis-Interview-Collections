# Redis Study Notes

My hands-on journey learning **Redis from scratch**, targeting the current version (**Redis 8.x**).
Every topic is practiced in `redis-cli` and backed by interview-style questions.

## Why Redis

Redis is an in-memory data store used for caching, sessions, rate limiting, leaderboards, queues and messaging.
I'm learning it as part of my full-stack and DevOps path: building scalable apps that handle load well.

## Setup

```bash
docker run -d --name redis -p 6379:6379 redis:8
docker exec -it redis redis-cli
PING   # -> PONG
```

## Files

| File | Covers |
| --- | --- |
| [redis-interview-1.md](./redis-interview-1.md) | Basics, Strings, Lists, Hashes, Sets, Sorted Sets, key listing (KEYS vs SCAN), Redis JSON, Streams, common mistakes, interview answers |

## Progress

**Pace:** 3–4 focused hours a day, about 7–8 days in total.

- [x] **Day 1:** Redis basics, Docker setup, expiry, atomic counters, and all 5 core data types
- [ ] **Day 2:** Redis JSON ✅, Streams and consumer groups (practice pending), Persistence (RDB vs AOF)
- [ ] **Day 3:** Caching patterns, eviction policies, Node.js integration
- [ ] **Day 4:** Pub/Sub, queues, transactions, Lua scripts
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

## Resources

- [Redis documentation](https://redis.io/docs/latest/)
- [Redis commands reference](https://redis.io/docs/latest/commands/)
