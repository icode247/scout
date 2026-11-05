/**
 * Writes src/data/page-lastmod.json: the date each public page last really changed, for the
 * sitemap's <lastmod>. Run `npm run seo:dates` before committing a page edit.
 *
 * The file is committed rather than computed during the build because Vercel builds from a
 * shallow clone, where `git log` cannot see a page's history. Never use the build date: it would
 * tell Google that every page changed on every deploy. A file with uncommitted edits gets today.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const PAGES = "src/pages";
const OUTPUT = "src/data/page-lastmod.json";
// Dynamic routes change with their data as well as their template.
const DYNAMIC = {
  "/compare": ["src/pages/compare/[competitor].astro", "src/data/competitors.ts"],
  "/auto-apply": ["src/pages/auto-apply/[ats].astro", "src/data/ats.ts"],
  "/job-application-service": ["src/pages/job-application-service/[country].astro", "src/data/countries.ts"],
};

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const today = new Date().toISOString().slice(0, 10);
const lastChanged = (...files) =>
  git("status", "--porcelain", "--", ...files) ? today : git("log", "-1", "--format=%cs", "--", ...files);

function astroFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "api" ? [] : astroFiles(path);
    return name.endsWith(".astro") && !name.includes("[") ? [path] : [];
  });
}

const pages = {};
for (const file of astroFiles(PAGES).sort()) {
  const route = `/${relative(PAGES, file).replace(/\.astro$/, "").replace(/(^|\/)index$/, "")}`;
  const date = lastChanged(file);
  if (date) pages[route.length > 1 ? route.replace(/\/$/, "") : route] = date;
}
const prefixes = Object.fromEntries(Object.entries(DYNAMIC).map(([prefix, files]) => [prefix, lastChanged(...files)]));

writeFileSync(OUTPUT, `${JSON.stringify({ pages, prefixes }, null, 2)}\n`);
console.log(`${OUTPUT}: ${Object.keys(pages).length} pages, ${Object.keys(prefixes).length} dynamic routes`);
