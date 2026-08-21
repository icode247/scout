import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";
import remarkGfm from "remark-gfm";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { SITE } from "./src/config/site.ts";
import { isNonIndexablePath } from "./src/config/seo.ts";

const blogDirectory = new URL("./src/content/blog/", import.meta.url);
const blogLastModified = new Map(
  readdirSync(blogDirectory)
    .filter((filename) => filename.endsWith(".md") || filename.endsWith(".mdx"))
    .map((filename) => {
      const source = readFileSync(join(blogDirectory.pathname, filename), "utf8");
      const published = source.match(/^pubDate:\s*["']?([^\s"']+)/m)?.[1];
      const updated = source.match(/^updatedDate:\s*["']?([^\s"']+)/m)?.[1];
      const date = updated ?? published;
      return [`/blog/${basename(filename).replace(/\.mdx?$/, "")}`, date];
    })
    .filter((entry) => entry[1]),
);
const latestBlogUpdate = [...blogLastModified.values()].sort().at(-1);

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  adapter: vercel(),
  output: "server",
  trailingSlash: "never",
  // Vercel terminates TLS at the edge and forwards the real host in `x-forwarded-host`.
  // Astro only trusts that header for hosts listed here; with an empty list it discards
  // both it and `Host`, and `context.url.origin` silently becomes `https://localhost`.
  // That broke every POST form (origin check 403) and every auth redirect built from
  // the request origin. Keep this in sync with the project's Vercel aliases.
  security: {
    // Astro's built-in CSRF check 403s any non-GET request whose `origin` header
    // is missing or mismatched, but only for form-ish content types
    // (x-www-form-urlencoded, multipart/form-data, text/plain). Dodo posts the
    // billing webhook server-to-server with one of those and no origin header,
    // so every delivery was rejected before reaching the handler — meaning paid
    // subscriptions never activated. Astro has no per-route opt-out.
    //
    // Turning it off costs nothing here: every mutating endpoint already calls
    // assertSameOrigin (lib/api.ts), which is strictly stronger — it applies to
    // all content types, not just forms, and rejects a missing origin outright.
    // The only endpoints without it are the ones that must not have it, and each
    // authenticates another way: the webhook by HMAC signature, the cron routes
    // by CRON_SECRET, /api/extension by CORS plus session, and /api/book-call is
    // deliberately public behind a rate limit and honeypot.
    checkOrigin: false,
    allowedDomains: [
      { hostname: "applyscout.app", protocol: "https" },
      { hostname: "*.applyscout.app", protocol: "https" },
      { hostname: "**.vercel.app", protocol: "https" },
    ],
  },
  redirects: {
    "/first-apply": "/ai-job-application-assistant",
    "/swipe-apply": "/human-job-application-service",
  },
  markdown: {
    remarkPlugins: [remarkGfm],
    shikiConfig: { theme: "github-light", wrap: true },
  },
  image: {
    service: { entrypoint: "astro/assets/services/sharp" },
  },
  integrations: [
    tailwind({ applyBaseStyles: false }),
    react(),
    mdx(),
    sitemap({
      filter: (page) => {
        const pathname = new URL(page).pathname;
        return !isNonIndexablePath(pathname);
      },
      serialize(item) {
        const pathname = new URL(item.url).pathname;
        const lastmod = pathname === "/blog" ? latestBlogUpdate : blogLastModified.get(pathname);
        if (lastmod) item.lastmod = new Date(lastmod).toISOString();
        return item;
      },
    }),
  ],
  vite: {
    define: {
      __PLAUSIBLE_DOMAIN__: JSON.stringify(process.env.PUBLIC_PLAUSIBLE_DOMAIN || ""),
    },
    server: {
      // Dev server only; production is served by Vercel and never runs this.
      // Vite 6 rejects any request whose Host header is not local with a bare
      // 403 "Blocked request", before Astro sees it. A tunnel forwards its own
      // hostname, so webhook deliveries to an ngrok or cloudflared URL were
      // being dropped at the Vite layer. A leading dot matches subdomains.
      allowedHosts: [".ngrok-free.app", ".ngrok.io", ".ngrok.app", ".trycloudflare.com", ".loca.lt"],
    },
    ssr: {
      external: ["@vercel/og"],

      // sanitize-html is CommonJS but depends on htmlparser2@12, which is
      // ESM-only. Left external, the deployed function hits sanitize-html's
      // require("htmlparser2") at module load and Vercel's runtime loader
      // throws ERR_REQUIRE_ESM — which 500'd /jobs and /api/app/job-search
      // before middleware ever ran. Bundling only sanitize-html is not
      // enough either: Vite's CJS interop then emits default-imports of its
      // still-external deps (`import x from "is-plain-object"`), which have
      // no default export as ESM — the same crash one layer down. So the
      // whole transitive dependency closure of sanitize-html is bundled;
      // no runtime import of any of these may remain in the server output.
      noExternal: [
        "sanitize-html", "htmlparser2", "dayjs", "deepmerge", "dom-serializer",
        "domelementtype", "domhandler", "domutils", "entities",
        "escape-string-regexp", "is-plain-object", "launder", "nanoid",
        "parse-srcset", "picocolors", "postcss", "source-map-js",
      ],
    },
  },
});
