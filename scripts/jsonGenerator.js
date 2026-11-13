import matter from "gray-matter";
import { postSlug } from "../src/lib/utils/slug.ts";
import fs from "node:fs";
import path from "node:path";

const languagesPath = new URL("../src/config/language.json", import.meta.url);
const languages = JSON.parse(fs.readFileSync(languagesPath, "utf8"));

const JSON_FOLDER = "./.json";
const CONTENT_ROOT = "src/content";
const CONTENT_DEPTH = 3;
const BLOG_FOLDER = "blog";

// slug -> source file, for the duplicate-slug build error below.
const slugSources = new Map();

// get data from markdown
const getData = (folder, groupDepth, langIndex = 0) => {
  const getPaths = languages
    .map((lang, index) => {
      const langFolder = lang.contentDir ? lang.contentDir : lang.languageCode;
      const dir = path.join(CONTENT_ROOT, folder, langFolder);
      return fs
        .readdirSync(dir)
        .filter(
          (filename) =>
            !filename.startsWith("-") &&
            (filename.endsWith(".md") || filename.endsWith(".mdx")),
        )
        .flatMap((filename) => {
          const filepath = path.join(dir, filename);
          const stats = fs.statSync(filepath);
          const isFolder = stats.isDirectory();

          if (isFolder) {
            return getData(filepath, groupDepth, index);
          } else {
            const file = fs.readFileSync(filepath, "utf-8");
            const { data, content } = matter(file);
            const pathParts = filepath.split(path.sep);

            // Filename-derived id within this language dir, e.g. "post-1"
            // (nested: "guides/x"). A custom `slug` wins over it (normalised,
            // leading `blog/` forgiven); the emitted search slug is always the
            // full public path, so result links are `/blog/<slug>` — a bare
            // custom slug previously produced a broken `/<slug>` link.
            const id = pathParts
              .slice(CONTENT_DEPTH + 1)
              .join("/")
              .replace(/\.[^/.]+$/, "");
            const slug = `${BLOG_FOLDER}/${postSlug({ id, data })}`;
            // Two posts in the SAME language must never resolve to the same
            // public URL. (Keyed per language: en/post-1 and fr/post-1 share
            // the slug "blog/post-1" legitimately.)
            const langCode = languages[index].languageCode;
            const dupKey = `${langCode}:${slug}`;
            if (!slugSources.has(dupKey)) {
              slugSources.set(dupKey, []);
            }
            slugSources.get(dupKey).push(filepath);
            data.slug = slug;
            const group = "blog";

            return {
              lang: languages[index].languageCode, // Set the correct language code dynamically
              group: group,
              slug: data.slug,
              frontmatter: data,
              content: content,
            };
          }
        });
    })
    .flat();

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
  // create folder if it doesn't exist
  if (!fs.existsSync(JSON_FOLDER)) {
    fs.mkdirSync(JSON_FOLDER);
  }

  // create json files
  const posts = getData(BLOG_FOLDER, 3);

  // Two posts must never resolve to the same public URL. Fail loudly here
  // (before astro build) with the conflicting files listed.
  const conflicts = [...slugSources.entries()].filter(
    ([, files]) => files.length > 1,
  );
  if (conflicts.length > 0) {
    const lines = conflicts.map(
      ([dupKey, files]) =>
        `  /${dupKey.split(":")[1]} (${dupKey.split(":")[0]}) <- ${[...files].sort().join(", ")}`,
    );
    throw new Error(
      `Duplicate blog post URLs — two or more posts resolve to the same public URL. ` +
        `Give each post a unique custom \`slug\` (or rename the file):\n${lines.join("\n")}`,
    );
  }

  fs.writeFileSync(`${JSON_FOLDER}/posts.json`, JSON.stringify(posts));

  // merge json files for search
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
