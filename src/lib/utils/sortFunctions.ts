// NaN-safe date value: undated (or invalid-dated) posts sort last
// instead of producing NaN comparisons with unstable ordering.
type DatedEntry = { data: { date?: string | Date | null } };

const timeOf = (item: DatedEntry): number => {
  const time = new Date(item.data.date ?? "").valueOf();
  return Number.isNaN(time) ? -Infinity : time;
};

// sort by date
export const sortByDate = <T extends DatedEntry>(array: T[]): T[] => {
  const sortedArray = array.sort((a, b) => timeOf(b) - timeOf(a));
  return sortedArray;
};

type WeightedEntry = { data: { weight?: number | null } };

// sort product by weight
export const sortByWeight = <T extends WeightedEntry>(array: T[]): T[] => {
  const withWeight = array.filter((item) => item.data.weight);
  const withoutWeight = array.filter((item) => !item.data.weight);
  const sortedWeightedArray = withWeight.sort(
    (a, b) => (a.data.weight ?? 0) - (b.data.weight ?? 0),
  );
  const sortedArray = [...new Set([...sortedWeightedArray, ...withoutWeight])];
  return sortedArray;
};
