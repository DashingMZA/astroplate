// NaN-safe date value: undated (or invalid-dated) posts sort last
// instead of producing NaN comparisons with unstable ordering.
const timeOf = (item: any): number => {
  const time = new Date(item.data.date).valueOf();
  return Number.isNaN(time) ? -Infinity : time;
};

// sort by date
export const sortByDate = (array: any[]) => {
  const sortedArray = array.sort((a: any, b: any) => timeOf(b) - timeOf(a));
  return sortedArray;
};

// sort product by weight
export const sortByWeight = (array: any[]) => {
  const withWeight = array.filter(
    (item: { data: { weight: any } }) => item.data.weight,
  );
  const withoutWeight = array.filter(
    (item: { data: { weight: any } }) => !item.data.weight,
  );
  const sortedWeightedArray = withWeight.sort(
    (a: { data: { weight: number } }, b: { data: { weight: number } }) =>
      a.data.weight - b.data.weight,
  );
  const sortedArray = [...new Set([...sortedWeightedArray, ...withoutWeight])];
  return sortedArray;
};
