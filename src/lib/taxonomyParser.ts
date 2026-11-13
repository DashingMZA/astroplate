import { getSinglePage } from "@/lib/contentParser";
import { slugify } from "@/lib/utils/textConverter";
import type { CollectionKey } from "astro:content";

// Plain .ts module (was taxonomyParser.astro): .astro files cannot export
// values (astro/no-exports-from-components), and these helpers are pure
// data access with no markup. All importers use the extensionless
// "@/lib/taxonomyParser" path.

// Collect the string values of one frontmatter field across a collection.
const collectTaxonomyValues = async (
  collection: CollectionKey,
  name: string,
): Promise<string[]> => {
  const singlePages = await getSinglePage(collection);
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
export const getTaxonomy = async (collection: CollectionKey, name: string) => {
  const taxonomies = await collectTaxonomyValues(collection, name);
  const taxonomy = [...new Set(taxonomies)];
  return taxonomy;
};

// get all taxonomies from frontmatter
export const getAllTaxonomy = async (
  collection: CollectionKey,
  name: string,
) => {
  return collectTaxonomyValues(collection, name);
};
