// Generic street-type words ("שדרות דוד בן גוריון" vs "בן גוריון"). Only used to generate
// fuzzy candidates (tier 3) — never for the exact/reordered match (tier 2), because some of
// these words are load-bearing parts of a compound name in this data (e.g. "מעלה הצבי",
// "שד' הצבי" and the plain street "צבי" are three DIFFERENT streets; dropping "מעלה"/"שד" for
// an exact-key match collapsed all three onto one key and cross-matched them onto each
// other's collection day). Tier 3 stays safe because it additionally requires the OSM
// candidate to have strictly more words than the (generic-stripped) scheduled name.
const GENERIC = new Set(["רחוב", "רח", "שדרות", "שד", "דרך", "סמטת", "סמטה", "כיכר", "מעלה", "שכונת"]);

// A trailing quoted abbreviation ("ר\"א", "כ\"א") is ambiguous on its own: it's sometimes the
// whole street name (an acronym like "רש\"י", "רמב\"ם" — never drop those), and sometimes a
// municipal area/zone code appended after a real name ("אגוז ר\"א" — always drop that "ר\"א").
// The only reliable signal is how often it recurs: a genuine acronym name is basically never
// reused verbatim as a *suffix* of several otherwise-different street names, while an area
// code is, by definition — measured on live data, ר"א/כ"א each show up after 20-100+ distinct
// base names in the cities that use them. See findAreaCodeSuffixes.
const ABBREVIATION = /^[א-ת]+["'׳״][א-ת]$/;
const AREA_CODE_MIN_DISTINCT_BASES = 3;

function stripPunctuation(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/[־\-–—/.,]/g, " ")
    .replace(/[֑-ֽֿ-ׇ]/g, "")
    .trim();
}

/** Scans every scheduled street name in a city and finds trailing quoted-abbreviation tokens
 *  that repeat across several otherwise-different names — i.e. area/zone codes rather than
 *  part of the name itself (see ABBREVIATION comment above). */
export function findAreaCodeSuffixes(cityScheduled: Iterable<string>): Set<string> {
  const basesBySuffix = new Map<string, Set<string>>();
  for (const raw of cityScheduled) {
    const words = stripPunctuation(raw).split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;
    const last = words[words.length - 1];
    if (!ABBREVIATION.test(last)) continue;
    const base = words.slice(0, -1).join(" ");
    const key = last.replace(/["'׳״]/g, "");
    if (!basesBySuffix.has(key)) basesBySuffix.set(key, new Set());
    basesBySuffix.get(key)!.add(base);
  }
  const areaCodes = new Set<string>();
  for (const [suffix, bases] of basesBySuffix) {
    if (bases.size >= AREA_CODE_MIN_DISTINCT_BASES) areaCodes.add(suffix);
  }
  return areaCodes;
}

/** Comparable word list for a street name: drops qualifiers in parentheses, house-number
 *  ranges, punctuation, single-letter initials, a detected area-code suffix (unless `name` is
 *  in `protectedZoneNames` — see findProtectedZoneNames) and the leading article "ה".
 *  `dropGeneric` additionally drops street-type words (see GENERIC above) — only safe to set
 *  for fuzzy (tier 3) candidate generation, never for the exact/key match. */
function tokens(name: string, areaCodes: Set<string>, dropGeneric: boolean, protectedZoneNames: Set<string>): string[] {
  const cleaned = stripPunctuation(name).replace(/["'׳״]/g, "");
  let words = cleaned.split(/\s+/).filter(Boolean);
  const dropIfSomethingLeft = (pred: (w: string) => boolean) => {
    const kept = words.filter((w) => !pred(w));
    if (kept.length > 0) words = kept;
  };
  dropIfSomethingLeft((w) => /^\d+$/.test(w));
  if (words.length > 1 && areaCodes.has(words[words.length - 1]) && !protectedZoneNames.has(name)) {
    words = words.slice(0, -1);
  }
  dropIfSomethingLeft((w) => w.length === 1);
  if (dropGeneric) dropIfSomethingLeft((w) => GENERIC.has(w));
  return words.map((w) => (w.length >= 4 && w.startsWith("ה") ? w.slice(1) : w));
}

const keyOf = (t: string[]) => [...t].sort().join(" ");

/** For every scheduled name that carries an area-code suffix (e.g. "רימון ר\"א"), finds whether
 *  stripping that suffix would make it normalise to the SAME identity as some OTHER scheduled
 *  entry in the city — not necessarily an identical string, e.g. "רימון ר\"א" strips to "רימון",
 *  which is also what "הרימון" normalises to once its "ה" article is dropped. When that happens,
 *  the two rows are the same physical street split into a general schedule and a sub-zone
 *  schedule that OSM's street-level (not house-number-level) geometry cannot actually
 *  distinguish — e.g. here "הרימון" collects שלישי, "רימון ר\"א" collects רביעי AND שני.
 *  Stripping the suffix would make the OSM way light up on רביעי/שני too, for every resident,
 *  including the ones outside the ר"א sub-zone — a wrong-day highlight, not just a missing one.
 *  Returns the set of *full suffixed names* (not bases) whose suffix must NOT be stripped. */
function findProtectedZoneNames(cityScheduled: Iterable<string>): Set<string> {
  const all = [...new Set(cityScheduled)];
  const areaCodes = findAreaCodeSuffixes(all);
  const none = new Set<string>();
  const naturalKeyOf = new Map(all.map((name) => [name, keyOf(tokens(name, new Set(), false, none))]));
  const namesByNaturalKey = new Map<string, string[]>();
  for (const [name, key] of naturalKeyOf) namesByNaturalKey.set(key, [...(namesByNaturalKey.get(key) ?? []), name]);

  const protectedNames = new Set<string>();
  for (const name of all) {
    const strippedKey = keyOf(tokens(name, areaCodes, false, none));
    if (strippedKey === naturalKeyOf.get(name)) continue; // nothing was actually stripped
    const collidesWithOther = (namesByNaturalKey.get(strippedKey) ?? []).some((other) => other !== name);
    if (collidesWithOther) protectedNames.add(name);
  }
  return protectedNames;
}

/**
 * Picks which OSM street names the scheduled (municipal) street names refer to. Deliberately
 * conservative — highlighting the wrong street on the map is worse than not highlighting one:
 *  1. identical names;
 *  2. same words after normalisation — reordered names, initials, "ה" article, house-number
 *     ranges, brackets, a detected area-code suffix — but NOT generic street-type words, since
 *     those can be load-bearing in a compound name (see GENERIC comment);
 *  3. the scheduled name, with generic street-type words also dropped, is a shortened form of
 *     exactly ONE OSM street (whole words only, and the OSM side must have strictly MORE words
 *     left than the scheduled side), e.g. "רמז" -> "דוד רמז". If it could be several streets
 *     ("בן גוריון" -> two of them) or the OSM side isn't actually longer, it is skipped.
 * Substring matching in either direction is intentionally not used ("הס" must not match
 * "ההסתדרות", "משה" must not match "כיכר בראמשה").
 *
 * `cityScheduled` is every scheduled name in the city (all collection days) — pass this even
 * when `scheduled` is only one day's names, so area-code suffixes (see findAreaCodeSuffixes)
 * are detected from the city's full street list, not just the day being matched. Defaults to
 * `scheduled` itself when omitted.
 */
export function matchScheduledStreets(
  scheduled: Iterable<string>,
  osmNames: Iterable<string>,
  cityScheduled?: Iterable<string>
): Set<string> {
  const cityNames = cityScheduled ?? scheduled;
  const areaCodes = findAreaCodeSuffixes(cityNames);
  const protectedZoneNames = findProtectedZoneNames(cityNames);
  const noProtected = new Set<string>();
  const tExact = (n: string, protectedNames = noProtected) => tokens(n, areaCodes, false, protectedNames);
  const tFuzzy = (n: string, protectedNames = noProtected) => tokens(n, areaCodes, true, protectedNames);

  const osm = [...new Set(osmNames)].map((name) => ({
    name,
    exactKey: keyOf(tExact(name)),
    fuzzyWords: new Set(tFuzzy(name)),
  }));
  const byName = new Map(osm.map((o) => [o.name, o]));
  const byExactKey = new Map<string, string[]>();
  for (const o of osm) byExactKey.set(o.exactKey, [...(byExactKey.get(o.exactKey) ?? []), o.name]);

  const matched = new Set<string>();
  for (const s of new Set(scheduled)) {
    if (byName.has(s)) { matched.add(s); continue; }

    const sameKey = byExactKey.get(keyOf(tExact(s, protectedZoneNames)));
    if (sameKey) { sameKey.forEach((n) => matched.add(n)); continue; }

    const sFuzzy = tFuzzy(s, protectedZoneNames);
    if (sFuzzy.join("").length < 3) continue;
    const candidates = osm.filter((o) => o.fuzzyWords.size > sFuzzy.length && sFuzzy.every((w) => o.fuzzyWords.has(w)));
    if (candidates.length > 0 && new Set(candidates.map((c) => keyOf([...c.fuzzyWords]))).size === 1) {
      candidates.forEach((c) => matched.add(c.name));
    }
  }
  return matched;
}
