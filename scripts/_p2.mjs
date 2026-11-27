import { createHmac } from "node:crypto";
const path = process.argv[2];
const p = { shop: "urban-deco-dev.myshopify.com", logged_in_customer_id: "", path_prefix: "/apps/cfs", timestamp: String(Math.floor(Date.now() / 1000)), t: "7958a950fefe06664d05bd6dd9eaa1064c5655fa6bd1d616" };
const msg = Object.keys(p).sort().map((k) => `${k}=${p[k]}`).join("");
p.signature = createHmac("sha256", process.env.SHOPIFY_API_SECRET).update(msg).digest("hex");
const res = await fetch(`https://cfs-order-status-panel.onrender.com${path}?${new URLSearchParams(p)}`, { headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "Mozilla/5.0" } });
console.log(path, res.status, res.headers.get("content-type"), (await res.text()).replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 100));
