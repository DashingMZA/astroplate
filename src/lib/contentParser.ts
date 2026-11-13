import {
  getCollection,
  type CollectionEntry,
  type CollectionKey,
} from "astro:content";

import config from "@/config/config.json";
import languages from "@/config/language.json";

// Plain .ts module (was contentParser.astro): .astro files cannot export
// values (astro/no-exports-from-components), and these helpers are pure
// data access with no markup. All importers use the extensionless
// "@/lib/contentParser" path.
//
// Multilingual note: both helpers take the page language as their second
// argument and scope every lookup to that language's contentDir
// ("english"/"french") from src/config/language.json — the old .astro
// version's signatures are preserved exactly, so no call site changes
// beyond dropping the ".astro" import suffix.

type PageData = {
  title: string;
  meta_title?: string;
  description?: string;
  image?: string;
  draft?: boolean;
  date?: string | Date;
};

// Resolve the content directory for a language code (defaults to the
// configured default language); throws when the code is unknown.
const resolveContentDir = (lang: string | undefined): string => {
  const { default_language } = config.settings;
  const selectedLanguageCode = lang || default_language;
  const language = languages.find(
    (l) => l.languageCode === selectedLanguageCode,
  );
  if (!language) {
    throw new Error("Language not found");
  }
  return language.contentDir;
};

export const getSinglePage = async <C extends CollectionKey>(
  collectionName: C,
  lang: string | undefined,
  subCollectionName?: string,
): Promise<CollectionEntry<C>[]> => {
  const contentDir = resolveContentDir(lang);

  const path = subCollectionName
    ? `${contentDir}/${subCollectionName}`
    : contentDir;

  const buildDrafts = process.argv.includes("--buildDrafts");
  const buildFuture = process.argv.includes("--buildFuture");
  const now = new Date();

  const pages = await getCollection(
    collectionName,
    ({ data, id }: { data: unknown; id: string }) => {
      if (!buildDrafts && (data as PageData)?.draft) {
        return false;
      }
      if (!buildFuture && (data as PageData)?.date) {
        const postDate = new Date((data as PageData).date as string);
        if (postDate > now) {
          return false;
        }
      }
      return id.startsWith(path) && !id.endsWith("-index");
    },
  );

  return pages;
};

export const getListPage = async <C extends CollectionKey>(
  collectionName: C,
  lang: string | undefined,
): Promise<CollectionEntry<C>[]> => {
  const contentDir = resolveContentDir(lang);

  const pages = await getCollection(
    collectionName,
    ({ id }: { id: string }) => {
      return id.startsWith(contentDir);
    },
  );

  // Sort the pages array
  return pages.sort((a, b) => {
    // Put -index at the top
    if (a.id.endsWith("-index")) return -1;
    if (b.id.endsWith("-index")) return 1;

    // For other posts, sort by their numeric part
    const aNum = parseInt(a.id.match(/\d+/)?.[0] || "0");
    const bNum = parseInt(b.id.match(/\d+/)?.[0] || "0");
    return aNum - bNum;
  });
};
