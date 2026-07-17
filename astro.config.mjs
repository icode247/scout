import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel";
import { defineConfig } from "astro/config";
import remarkGfm from "remark-gfm";

import { SITE } from "./src/config/site.ts";

// https://astro.build/config
export default defineConfig({
  site: SITE.url,
  adapter: vercel(),
  output: "server",
  trailingSlash: "never",
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
        const excluded = [
          "/applications", "/dashboard", "/jobs", "/profiles",
          "/login", "/onboarding", "/delete-account",
          "/first-apply", "/swipe-apply",
        ];
        return !excluded.includes(pathname) && !pathname.startsWith("/variants/");
      },
    }),
  ],
  vite: {
    define: {
      __PLAUSIBLE_DOMAIN__: JSON.stringify(process.env.PUBLIC_PLAUSIBLE_DOMAIN || ""),
    },
  },
});
