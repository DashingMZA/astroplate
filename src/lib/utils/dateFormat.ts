// Display-date formatting. Delegates to the centralized date utility
// (`src/lib/utils/dates.ts`) so local builds and Vercel builds (UTC)
// render identically — date-fns `format` used the build machine's
// local timezone, so the same post could show a different day.
import { formatDisplayDate } from "@/lib/utils/dates";

const dateFormat = (
  date: Date | string,
  pattern: string = "dd MMM, yyyy",
): string => formatDisplayDate(date, pattern);

export default dateFormat;
