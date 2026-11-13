import {
  getCollection,
  getEntry,
  type CollectionEntry,
  type CollectionKey,
} from "astro:content";

// Plain .ts module (was contentParser.astro): .astro files cannot export
// values (astro/no-exports-from-components), and these helpers are pure
// data access with no markup. All importers use the extensionless
// "@/lib/contentParser" path.
type PageData = {
  title: string;
  meta_title?: string;
  description?: string;
  image?: string;
  draft?: boolean;
  date?: string | Date;
};

export const getSinglePage = async <C extends CollectionKey>(
  collectionName: C,
): Promise<CollectionEntry<C>[]> => {
  const buildDrafts = process.argv.includes("--buildDrafts");
  const buildFuture = process.argv.includes("--buildFuture");
  const now = new Date();

  const allPages = await getCollection(collectionName, ({ data, id }) => {
    if (!buildDrafts && (data as PageData)?.draft) {
      return false;
    }
    if (!buildFuture) {
      const date = (data as PageData)?.date;
      if (date) {
        const postDate = new Date(date);
        if (postDate > now) {
          return false;
        }
      }
    }
    return !id.startsWith("-");
  });
  return allPages;
};

export const getListPage = async <C extends CollectionKey>(
  collectionName: C,
  documentId: "-index" | string,
): Promise<CollectionEntry<C>> => {
  const data = (await getEntry(
    collectionName,
    documentId,
  )) as CollectionEntry<C> | null;

  if (!data) {
    throw new Error(
      `No page found for the collection: ${collectionName} with filename: ${documentId}`,
    );
  }

  return data;
};
