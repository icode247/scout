import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { SITE } from "../config/site";

export async function GET(context) {
  const posts = (await getCollection("blog"))
    .filter((p) => !p.data.draft)
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
  const response = await rss({
    title: `${SITE.name} Blog`,
    description: "Job search, application automation, and getting hired faster with Scout.",
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.pubDate,
      link: `/blog/${p.id}`,
    })),
  });
  response.headers.set("X-Robots-Tag", "noindex, follow");
  return response;
}
