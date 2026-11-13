import config from "@/config/config.json";
import languages from "@/config/language.json";
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { canonicalFor } from "@/lib/utils/seo";
import { postUrl } from "@/lib/utils/slug";

export const GET: APIRoute = async (context) => {
  // The single RSS feed carries the default language only; the other
  // language's posts live under their own /fr/… URLs and are not in this feed.
  const { default_language } = config.settings;
  const defaultDir =
    languages.find((l: any) => l.languageCode === default_language)
      ?.contentDir ?? default_language;

  const posts = await getCollection(
    "blog",
    ({ data, id }) =>
      !data.draft &&
      !data.noindex &&
      !id.startsWith("-") &&
      id.startsWith(`${defaultDir}/`) &&
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
    // Links are absolute canonical URLs (custom-slug aware). Passing an
    // absolute URL keeps @astrojs/rss from appending a trailing slash, so
    // RSS links agree with the canonical / sitemap URLs exactly.
    items: sorted.map((post) => ({
      title: post.data.title,
      description: post.data.description ?? "",
      // postUrl needs the language-neutral id: strip the "english/" dir.
      link: canonicalFor(
        postUrl({
          id: post.id.slice(defaultDir.length + 1),
          data: post.data,
        }),
      ),
      pubDate: post.data.date ? new Date(post.data.date) : undefined,
      author: post.data.author,
      categories: post.data.categories,
    })),
  });
};
