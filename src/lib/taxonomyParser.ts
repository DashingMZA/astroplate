import config from "@/config/config.json";
import languages from "@/config/language.json";
import { slugify } from "@/lib/utils/textConverter";
import { getCollection } from "astro:content";

// Plain .ts module (was taxonomyParser.astro): .astro files cannot export
// values (astro/no-exports-from-components), and these helpers are pure
// data access with no markup. All importers use the extensionless
// "@/lib/taxonomyParser" path.
//
// Multilingual note: the first argument is a language code ("en"/"fr") or
// a collection name ("blog") — exactly as the old .astro version accepted.
// It is resolved to the language's contentDir ("english"/"french"); any
// other value falls back to the default language's contentDir. Taxonomies
// are always read from the "blog" collection under that directory.

// Resolve the content directory for a language code (or fall back to the
// default language's directory when the argument is not a language code).
const resolveContentDir = (collection: string): string => {
  const { default_language } = config.settings;

  const language = languages.find((l) => l.languageCode === collection);
  if (language) {
    return language.contentDir;
  }

  const defaultLanguageMatch = languages.find(
    (l) => l.languageCode === default_language,
  );
  if (defaultLanguageMatch) {
    return defaultLanguageMatch.contentDir;
  }
  return default_language;
};

// Collect the string values of one frontmatter field across the blog
// posts of one language.
const collectTaxonomyValues = async (
  collection: string,
  name: string,
): Promise<string[]> => {
  const contentDir = resolveContentDir(collection);
  const singlePages = await getCollection("blog", ({ id }) => {
    return id.startsWith(contentDir) && !id.endsWith("-index");
  });
  const taxonomyPages = singlePages.map(
    (page) => (page.data as Record<string, unknown>)[name],
  );
  const taxonomies: string[] = [];
  for (const value of taxonomyPages) {
    // The field is a string array in the schema; skip anything else
    // instead of crashing the build on malformed frontmatter.
    if (!Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      if (typeof item === "string") {
        taxonomies.push(slugify(item));
      }
    }
  }
  return taxonomies;
};

// get taxonomy from frontmatter
export const getTaxonomy = async (collection: string, name: string) => {
  const taxonomies = await collectTaxonomyValues(collection, name);
  const taxonomy = [...new Set(taxonomies)];
  return taxonomy;
};

// get all taxonomies from frontmatter
export const getAllTaxonomy = async (collection: string, name: string) => {
  return collectTaxonomyValues(collection, name);
};
