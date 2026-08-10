import http from "node:http";
import { readFileSync } from "node:fs";
for (const line of readFileSync(".env", "utf8").split("\n")) {
  if (!line.includes("=") || line.trim().startsWith("#")) continue;
  const k = line.slice(0, line.indexOf("=")).trim();
  const v = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  if (k) process.env[k] = v;
}
const { default: handler } = await import("./.vercel/output/_functions/entry.mjs");
process.on("unhandledRejection", (e) => { console.error("\n=== UNHANDLED REJECTION ==="); console.error(e); });
http.createServer((req, res) => handler(req, res)).listen(4399, () => console.log("READY on 4399"));
