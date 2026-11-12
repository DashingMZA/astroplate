import config from "@/config/config.json";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async (context) => {
  const posts = await getCollection(
    "blog",
    ({ data, id }) =>
      !data.draft &&
      !id.startsWith("-") &&
      (!data.date || new Date(data.date) <= new Date()),
  );

  // Newest first; undated posts sort last.
  const sorted = posts.sort((a, b) => {
    const aTime = a.data.date ? new Date(a.data.date).valueOf() : 0;
    const bTime = b.data.date ? new Date(b.data.date).valueOf() : 0;
    return bTime - aTime;
  });

  return rss({
    title: config.site.title,
    description: config.metadata.meta_description,
    site: context.site?.toString() ?? config.site.base_url,
    items: sorted.map((post) => ({
      title: post.data.title,
      description: post.data.description ?? "",
      link: `/blog/${post.id}`,
      pubDate: post.data.date ? new Date(post.data.date) : undefined,
      author: post.data.author,
      categories: post.data.categories,
    })),
  });
};
