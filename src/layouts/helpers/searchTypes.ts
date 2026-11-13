// Shared search-index types. SearchModal.tsx and SearchResult.tsx used to
// each define their own copy of these shapes (ISearchItem / ISearchGroup
// with the frontmatter shape inlined twice); define them once here so the
// two components cannot drift apart. The shape mirrors what
// scripts/jsonGenerator.js writes to .json/search.json.
export interface ISearchItemFrontmatter {
  title: string;
  image?: string;
  description?: string;
  categories?: string[];
  tags?: string[];
}

export interface ISearchItem {
  group: string;
  slug: string;
  frontmatter: ISearchItemFrontmatter;
  content: string;
}

export interface ISearchGroup {
  group: string;
  groupItems: ISearchItem[];
}
