import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { postSlug } from "../src/lib/utils/slug.ts";

const CONTENT_DEPTH = 2;
const JSON_FOLDER = "./.json";
const BLOG_FOLDER = "src/content/blog";

// slug -> source file, for the duplicate-slug build error below.
const slugSources = new Map();

// get data from markdown
const getData = (folder, groupDepth) => {
  const getPath = fs.readdirSync(folder);
  const removeIndex = getPath.filter((item) => !item.startsWith("-"));

  const getPaths = removeIndex.flatMap((filename) => {
    const filepath = path.join(folder, filename);
    const stats = fs.statSync(filepath);
    const isFolder = stats.isDirectory();

    if (isFolder) {
      return getData(filepath, groupDepth);
    } else if (filename.endsWith(".md") || filename.endsWith(".mdx")) {
      const file = fs.readFileSync(filepath, "utf-8");
      const { data, content } = matter(file);
      const pathParts = filepath.split(path.sep);
      // Filename-derived id, e.g. "blog/post-1" (nested: "blog/guides/x").
      // A custom `slug` wins over it (normalised, leading `blog/` forgiven);
      // the emitted search slug is always the full public path, so result
      // links are `/blog/<slug>` — a bare custom slug previously produced
      // a broken `/<slug>` link.
      const id = pathParts
        .slice(CONTENT_DEPTH)
        .join("/")
        .replace(/\.[^/.]+$/, "");
      const slug = `blog/${postSlug({ id, data })}`;
      const group = pathParts[groupDepth];

      if (!slugSources.has(slug)) {
        slugSources.set(slug, []);
      }
      slugSources.get(slug).push(filepath);

      return {
        group: group,
        slug: slug,
        frontmatter: data,
        content: content,
      };
    } else {
      return [];
    }
  });

  const now = new Date();
  return getPaths.filter(
    (page) =>
      page &&
      // Same visibility rules as the router (getSinglePage) and RSS:
      // no drafts, no noindex pages, no future-dated posts.
      !page.frontmatter?.draft &&
      !page.frontmatter?.noindex &&
      (!page.frontmatter?.date || new Date(page.frontmatter.date) <= now),
  );
};

try {
  const posts = getData(BLOG_FOLDER, 2);

  // Two posts must never resolve to the same public URL. Fail loudly here
  // (before astro build) with the conflicting files listed.
  const conflicts = [...slugSources.entries()].filter(
    ([, files]) => files.length > 1,
  );
  if (conflicts.length > 0) {
    const lines = conflicts.map(
      ([slug, files]) => `  /${slug} <- ${[...files].sort().join(", ")}`,
    );
    throw new Error(
      `Duplicate blog post URLs — two or more posts resolve to the same public URL. ` +
        `Give each post a unique custom \`slug\` (or rename the file):\n${lines.join("\n")}`,
    );
  }

  // create folder if it doesn't exist
  if (!fs.existsSync(JSON_FOLDER)) {
    fs.mkdirSync(JSON_FOLDER);
  }

  // create json files
  fs.writeFileSync(`${JSON_FOLDER}/posts.json`, JSON.stringify(posts));

  // merger json files for search
  // (read back the file just written, relative to the working directory —
  // the old code resolved it against this script's own location, which only
  // agreed with the write when run from the repo root.)
  const search = JSON.parse(
    fs.readFileSync(`${JSON_FOLDER}/posts.json`, "utf8"),
  );
  fs.writeFileSync(`${JSON_FOLDER}/search.json`, JSON.stringify(search));
} catch (err) {
  console.error(err);
  // A broken search index must fail the build, not silently ship stale JSON.
  process.exit(1);
}
