# Redis Interview Notes – Part 2

Covers: Redis JSON, Streams and consumer groups, Persistence (RDB and AOF).
Target version: Redis 8.x

---

## 1. Redis JSON

Built into Redis 8, no extra install needed. It stores real nested JSON and updates one path at a time.
`$` means the root of the document.

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

**Most common mistake:** a string value needs its own double quotes inside single quotes, like `'"LV Jacket"'`.
Without them, Redis rejects it as invalid JSON.

| Hash | JSON |
| --- | --- |
| Flat data only | Nested objects and arrays |
| Lighter, slightly faster | More flexible |
| Sessions, counters | Orders with items, product variants |

**Rule:** flat data uses a hash; nested data uses JSON.

---

## 2. Streams

A stream is an **append-only log** of events. Each entry gets an auto ID (`timestamp-sequence`) and stays until deleted.

```
XADD orders * product "saree" qty 2    # * = auto ID
XLEN orders                            # number of entries
XRANGE orders - +                      # all entries (- = start, + = end)
XREAD COUNT 10 STREAMS orders 0        # read from the beginning
XREAD BLOCK 5000 STREAMS orders $      # wait 5s for NEW entries only
```

---

## 3. Consumer Groups

**Kitchen analogy**
- `orders` stream = the order board
- `workers` group = the team of chefs
- `w1`, `w2` = individual chefs
- Each order goes to **only one chef**, and the chef must say "done" (XACK).

```
XGROUP CREATE orders workers 0 MKSTREAM                 # 0 = include old entries, $ = new only
XREADGROUP GROUP workers w1 COUNT 1 STREAMS orders >    # > = give me an untaken message
XPENDING orders workers                                 # taken but not ACKed
XACK orders workers 1792762057514-0                     # mark as processed
```

**Flow**
```
XADD  →  XREADGROUP  →  pending  →  XACK  →  done
post     worker takes   working     finished
```

**What I saw in practice**
- After XREADGROUP: `XPENDING` showed **1** pending message, owned by `w1`.
- After XACK: `XPENDING` showed **0**.

**Important details**
- A message becomes pending **automatically** when a worker reads it.
- If a worker crashes before XACK, the message stays pending and can be reassigned. Nothing is lost.
- `XACK` does **not** delete the entry from the stream. It only removes it from the pending list. To delete entries, use `XDEL` or `XTRIM`.
- With `$` in XGROUP CREATE, entries added **before** the group was created are ignored.

| List queue | Stream |
| --- | --- |
| LPOP removes the item; a crash loses it | Entry stays pending until ACKed |
| One consumer per item | Consumer groups, many workers |
| No history | Replayable history |

---

## 4. Persistence

Redis keeps data in **RAM**. RAM is wiped when Redis stops. Persistence saves data to **disk** so it comes back after a restart.

### RDB (snapshot), like taking a photo
Saves a full copy of the data to `dump.rdb` at intervals.

```
BGSAVE              # save a snapshot in the background
LASTSAVE            # time of the last successful save
INFO persistence    # check rdb_last_bgsave_status:ok
```

- ✅ Small file, fast restart
- ❌ Loses everything written after the last snapshot (can be minutes)

### AOF (Append Only File), like a diary
Logs **every write command**. On restart, Redis replays the log.

```
CONFIG SET appendonly yes    # runtime only, lost on restart
INFO persistence             # check aof_enabled:1
```

- ✅ Loses at most about 1 second of data (default `appendfsync everysec`)
- ❌ Bigger file, slower restart

| RDB | AOF |
| --- | --- |
| Periodic snapshot | Logs every write |
| Can lose minutes of data | Loses about 1 second at most |
| Small file, fast restart | Bigger file, slower restart |

**Production:** turn on **both**.

### Docker gotchas
- `CONFIG SET appendonly yes` lasts only until the next restart. To keep AOF on permanently:
  ```bash
  docker run -d --name my-redis -p 6379:6379 -v redis-data:/data redis:8 redis-server --appendonly yes
  ```
- `docker restart` keeps the container's files. `docker rm` deletes them, so always mount a **volume** (`-v redis-data:/data`).
- My first AOF test passed only because Redis saved an RDB snapshot on shutdown. AOF itself was off after the restart.

---

## 5. Mistakes made in this part

- Missing inner quotes in `JSON.ARRAPPEND` (`"LV Jacket"` instead of `'"LV Jacket"'`).
- Typing `workes` instead of `workers`, which gave a `NOGROUP` error.
- Assuming `CONFIG SET` changes are permanent.

---

## 6. Interview answers

1. **Hash or JSON for a session?** Hash: the data is flat, and `HEXPIRE` can expire just the token field.
2. **Why is a Stream safer than a List for payments?** Reading a message doesn't remove it. It stays pending until the worker ACKs it after processing. If the worker crashes, another worker can take it over, so no payment is lost. With a List, LPOP deletes it immediately.
3. **Does XACK delete the message?** No. It only removes it from the pending list. Use `XDEL` or `XTRIM` to delete.
4. **RDB vs AOF?** RDB takes periodic snapshots: small and fast, but can lose minutes of data. AOF logs every write and loses at most about 1 second. Production uses both.
5. **RDB or AOF for a payment app?** AOF, because it loses at most about 1 second. But real payment records belong in a proper database like PostgreSQL. Redis is not the source of truth for money.
6. **Why does Redis need persistence at all?** Data lives in RAM, which is wiped on restart or crash.
