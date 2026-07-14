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

/** Parses "א' , ג' , ה'" into ["ראשון", "שלישי", "חמישי"]. */
export function parseHebrewDayAbbrList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim().replace(/['’]/g, ""))
    .filter(Boolean)
    .map((letter) => DAY_ABBR[letter])
    .filter((d): d is string => Boolean(d));
}

export function dayBefore(day: string): string {
  return DAY_BEFORE[day] ?? day;
}
