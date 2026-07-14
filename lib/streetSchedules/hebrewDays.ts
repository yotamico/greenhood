const DAY_ABBR: Record<string, string> = {
  "א": "ראשון",
  "ב": "שני",
  "ג": "שלישי",
  "ד": "רביעי",
  "ה": "חמישי",
  "ו": "שישי",
  "ש": "שבת",
};

// Israeli custom: garbage for a Sunday collection is put out Friday evening, skipping Shabbat —
// not a strict "calendar day minus one" for ראשון.
const DAY_BEFORE: Record<string, string> = {
  ראשון: "שישי",
  שני: "ראשון",
  שלישי: "שני",
  רביעי: "שלישי",
  חמישי: "רביעי",
  שישי: "חמישי",
};

/** Parses "א' , ג' , ה'" or "ב/ד/ו" into full day names, deduplicated. */
export function parseHebrewDayAbbrList(text: string): string[] {
  const days = text
    .split(/[,/+]/)
    .map((s) => s.trim().replace(/['’]/g, ""))
    .filter(Boolean)
    .map((letter) => DAY_ABBR[letter])
    .filter((d): d is string => Boolean(d));
  return [...new Set(days)];
}

export function dayBefore(day: string): string {
  return DAY_BEFORE[day] ?? day;
}

// Plain calendar next-day (no Shabbat-skip special case needed here — used for sources that
// publish the takeout day and expect the collection day to be derived, not the other way round).
const NEXT_DAY: Record<string, string> = {
  ראשון: "שני",
  שני: "שלישי",
  שלישי: "רביעי",
  רביעי: "חמישי",
  חמישי: "שישי",
  שישי: "שבת",
};

export function dayAfter(day: string): string {
  return NEXT_DAY[day] ?? day;
}
