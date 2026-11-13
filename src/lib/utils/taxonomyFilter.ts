import { slugify } from "@/lib/utils/textConverter";

type TaxonomyEntry = { data: Record<string, unknown> };

const taxonomyFilter = (posts: TaxonomyEntry[], name: string, key: string) =>
  posts.filter((post) => {
    const values = post.data[name];
    return (
      Array.isArray(values) &&
      values.map((value: string) => slugify(value)).includes(key)
    );
  });

export default taxonomyFilter;
