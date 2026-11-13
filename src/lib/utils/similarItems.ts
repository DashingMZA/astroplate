type SimilarEntry = {
  id: string;
  data: {
    categories?: string[];
    tags?: string[];
    date?: string | Date | null;
  };
};

// similar products
const similarItems = (
  currentItem: SimilarEntry,
  allItems: SimilarEntry[],
): SimilarEntry[] => {
  let categories: string[] = [];
  let tags: string[] = [];

  // set categories
  if ((currentItem.data.categories ?? []).length > 0) {
    categories = currentItem.data.categories ?? [];
  }

  // set tags
  if ((currentItem.data.tags ?? []).length > 0) {
    tags = currentItem.data.tags ?? [];
  }

  // NaN-safe date: undated posts sort last.
  const timeOf = (item: SimilarEntry): number => {
    const time = new Date(item.data.date ?? "").valueOf();
    return Number.isNaN(time) ? -Infinity : time;
  };

  // score candidates: shared categories first, then shared tags, then recency
  const scored = allItems
    .filter((item) => item.id !== currentItem.id)
    .map((item) => {
      const itemCategories: string[] = item.data.categories ?? [];
      const itemTags: string[] = item.data.tags ?? [];
      const sharedCategories = categories.filter((category) =>
        itemCategories.includes(category),
      ).length;
      const sharedTags = tags.filter((tag) => itemTags.includes(tag)).length;
      return { item, sharedCategories, sharedTags };
    })
    // only posts sharing at least one category or tag are related
    .filter(
      ({ sharedCategories, sharedTags }) =>
        sharedCategories > 0 || sharedTags > 0,
    )
    .sort((a, b) => {
      if (b.sharedCategories !== a.sharedCategories) {
        return b.sharedCategories - a.sharedCategories;
      }
      if (b.sharedTags !== a.sharedTags) {
        return b.sharedTags - a.sharedTags;
      }
      return timeOf(b.item) - timeOf(a.item);
    });

  // cap related posts at 3
  return scored.slice(0, 3).map(({ item }) => item);
};

export default similarItems;
