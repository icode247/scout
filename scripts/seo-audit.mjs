import fs from "node:fs";
import path from "node:path";

const distRoot = path.resolve("dist");
const root = fs.existsSync(path.join(distRoot, "client")) ? path.join(distRoot, "client") : distRoot;
if (!fs.existsSync(root)) {
  console.error("dist/ is missing. Run npm run build first.");
  process.exit(1);
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : [full];
});

const htmlFiles = walk(root).filter((file) => file.endsWith(".html"));
const routeFor = (file) => {
  const rel = path.relative(root, file).replaceAll(path.sep, "/");
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return "/" + rel.slice(0, -"/index.html".length);
  return "/" + rel.replace(/\.html$/, "");
};
const stripTags = (value = "") => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const attr = (html, tag, name, value, target) => {
  const tags = html.match(new RegExp("<" + tag + "\\b[^>]*>", "gi")) || [];
  const found = tags.find((item) => new RegExp("\\b" + name + "=[\\\"']" + value + "[\\\"']", "i").test(item));
  if (!found) return "";
  const doubleQuoted = found.match(new RegExp("\\b" + target + '="([^"]*)"', "i"))?.[1];
  const singleQuoted = found.match(new RegExp("\\b" + target + "='([^']*)'", "i"))?.[1];
  return doubleQuoted || singleQuoted || "";};
const canonicalFor = (html) => attr(html, "link", "rel", "canonical", "href");
const metaFor = (html, name) => attr(html, "meta", "name", name, "content");
const titleFor = (html) => stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
const h1Count = (html) => (html.match(/<h1\b/gi) || []).length;
const redirectFor = (html) => /http-equiv=[\"']refresh[\"']/i.test(html);

const pages = htmlFiles.map((file) => {
  const html = fs.readFileSync(file, "utf8");
  const route = routeFor(file);
  const robots = [metaFor(html, "robots"), metaFor(html, "googlebot")].join(" ").toLowerCase();
  return {
    file, html, route,
    title: titleFor(html),
    description: metaFor(html, "description"),
    canonical: canonicalFor(html),
    noindex: robots.includes("noindex"),
    redirect: redirectFor(html),
    h1s: h1Count(html),
  };
});

const routeSet = new Set(pages.map((page) => page.route));
const pageByPath = new Map(pages.map((page) => [page.route, page]));
const sitemapFiles = walk(root).filter((file) => /sitemap-\d+\.xml$/.test(file));
const sitemapUrls = sitemapFiles.flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
const sitemapPaths = new Set(sitemapUrls.map((url) => new URL(url).pathname.replace(/\/$/, "") || "/"));

const errors = [];
const warnings = [];
const indexable = pages.filter((page) => !page.noindex && !page.redirect);

for (const page of pages) {
  if (!page.title) errors.push(page.route + ": missing title");
  if (!page.description && !page.redirect) errors.push(page.route + ": missing meta description");
  if (!page.canonical) errors.push(page.route + ": missing canonical");
  if (!page.redirect && !page.noindex && page.h1s !== 1) errors.push(page.route + ": expected 1 H1, found " + page.h1s);

  if (page.canonical) {
    const canonical = new URL(page.canonical);
    if (canonical.origin !== "https://getscout.app") errors.push(page.route + ": wrong canonical origin");
    const canonicalPath = canonical.pathname.replace(/\/$/, "") || "/";
    if (!page.redirect && canonicalPath !== page.route) errors.push(page.route + ": canonical points to " + canonicalPath);
  }

  const jsonScripts = [...page.html.matchAll(/<script[^>]+type=[\"']application\/ld\+json[\"'][^>]*>([\s\S]*?)<\/script>/gi)];
  jsonScripts.forEach((match, index) => {
    try { JSON.parse(match[1]); } catch { errors.push(page.route + ": invalid JSON-LD block " + (index + 1)); }
  });

  if (!page.redirect && !page.noindex && page.title && (page.title.length < 20 || page.title.length > 65)) warnings.push(page.route + ": title length " + page.title.length);
  if (!page.redirect && !page.noindex && page.description && (page.description.length < 70 || page.description.length > 170)) warnings.push(page.route + ": description length " + page.description.length);

  for (const match of page.html.matchAll(/<a\b[^>]*href=[\"']([^\"']+)[\"']/gi)) {
    const href = match[1];
    if (!href.startsWith("/") || href.startsWith("//") || href.startsWith("/_astro/")) continue;
    const linked = new URL(href, "https://getscout.app").pathname.replace(/\/$/, "") || "/";
    if (!routeSet.has(linked) && !linked.startsWith("/og/") && !linked.startsWith("/assets/")) {
      errors.push(page.route + ": broken internal link to " + linked);
    }
  }
}

for (const page of indexable) {
  if (!sitemapPaths.has(page.route)) errors.push(page.route + ": indexable page missing from sitemap");
}
for (const sitemapPath of sitemapPaths) {
  const page = pageByPath.get(sitemapPath);
  if (!page) errors.push(sitemapPath + ": sitemap URL has no generated page");
  else if (page.noindex || page.redirect) errors.push(sitemapPath + ": noindex/redirect URL included in sitemap");
}

for (const field of ["title", "description"]) {
  const groups = new Map();
  for (const page of indexable) {
    const value = page[field];
    if (!value) continue;
    groups.set(value, [...(groups.get(value) || []), page.route]);
  }
  for (const [value, routes] of groups) {
    if (routes.length > 1) errors.push("duplicate " + field + ": " + routes.join(", "));
  }
}

const robots = fs.readFileSync(path.join(root, "robots.txt"), "utf8");
if (!/User-agent:\s*\*/i.test(robots)) errors.push("robots.txt: missing wildcard user agent");
if (!/Allow:\s*\//i.test(robots)) errors.push("robots.txt: site is not explicitly crawlable");
if (!/Sitemap:\s*https:\/\/getscout\.app\/sitemap-index\.xml/i.test(robots)) errors.push("robots.txt: sitemap declaration missing");

console.log("Googlebot-style static crawl");
console.log("  Generated HTML pages:", pages.length);
console.log("  Indexable canonical pages:", indexable.length);
console.log("  Noindex pages:", pages.filter((page) => page.noindex).length);
console.log("  Redirect pages:", pages.filter((page) => page.redirect).length);
console.log("  Sitemap URLs:", sitemapPaths.size);
console.log("  Valid JSON-LD blocks:", pages.reduce((sum, page) => sum + (page.html.match(/application\/ld\+json/g) || []).length, 0));
if (warnings.length) {
  console.log("\nWarnings:");
  warnings.forEach((warning) => console.log("  -", warning));
}
if (errors.length) {
  console.error("\nCrawl errors:");
  [...new Set(errors)].forEach((error) => console.error("  -", error));
  process.exit(1);
}
console.log("\nSEO CRAWL PASS: Googlebot can discover, parse, and index every canonical public page in the build.");
