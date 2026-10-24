import express, { Request, Response } from "express";
import { createClient } from "redis";

type Product = { id: number; name: string; price: number };

// ---------- Fake database (simulates a slow DB) ----------
const products: Record<number, Product> = {
  1: { id: 1, name: "Paithani Silk Saree", price: 15000 },
  2: { id: 2, name: "Cotton Saree", price: 2500 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const db = {
  async findProduct(id: number): Promise<Product | null> {
    await sleep(500); // pretend the DB is slow
    return products[id] ?? null;
  },
  async updatePrice(id: number, price: number): Promise<Product | null> {
    await sleep(500);
    const product = products[id];
    if (!product) return null;
    product.price = price;
    return product;
  },
};

// ---------- Redis client ----------
const redis = createClient({ url: "redis://localhost:6379" });
redis.on("error", (err) => console.error("Redis error:", err));
await redis.connect();
console.log("Connected to Redis");

const CACHE_TTL = 300; // seconds

// ---------- Cache-aside ----------
async function getProduct(
  id: number,
): Promise<{ product: Product | null; source: string }> {
  const key = `product:${id}`;

  const cached = await redis.get(key);
  if (cached) {
    return { product: JSON.parse(cached) as Product, source: "cache" };
  }

  const product = await db.findProduct(id);
  if (product) {
    await redis.set(key, JSON.stringify(product), { EX: CACHE_TTL });
  }
  return { product, source: "database" };
}

// ---------- Express app ----------
const app = express();
app.use(express.json());

app.get("/product/:id", async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    const id = Number(req.params.id);
    const { product, source } = await getProduct(id);
    const ms = Date.now() - start;
    console.log(`GET /product/${id} -> ${source} (${ms} ms)`);

    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ source, ms, product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/product/:id/price", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { price } = req.body as { price: number };

    const updated = await db.updatePrice(id, price);
    if (!updated) return res.status(404).json({ error: "Product not found" });

    await redis.del(`product:${id}`); // invalidate: update DB, then DEL cache
    console.log(`PUT /product/${id}/price -> cache invalidated`);
    res.json({ updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
