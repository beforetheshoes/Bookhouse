const LEADING_ARTICLE = /^(the|a|an)\s+/i;

export function generateSortTitle(titleDisplay: string): string {
  const trimmed = titleDisplay.trim();
  if (trimmed === "") return "";

  const match = LEADING_ARTICLE.exec(trimmed);
  if (match) {
    const article = match[1] as string;
    const rest = trimmed.slice(match[0].length);
    return `${rest.toLowerCase()}, ${article.toLowerCase()}`;
  }

  return trimmed.toLowerCase();
}

/**
 * Credentials that trail a name and say nothing about where it files.
 * Generational suffixes (Jr., III) are deliberately absent: they belong to the
 * person and stay with the given names.
 */
const TRAILING_CREDENTIAL = /^(phd|md|ma|mba|msc|dma|dds|edd|jd|esq|rn|dvm|lcsw)\.?$/i;

/** Suffixes that are part of the name but must not be mistaken for a surname. */
const GENERATIONAL_SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i;

/** Invert one person's name: "Ursula K. Le Guin" -> "guin, ursula k. le". */
function invertSingleName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.toLowerCase().trim();

  // "Martin Luther King Jr." files under King, with the suffix trailing.
  const suffixes: string[] = [];
  while (parts.length > 1 && GENERATIONAL_SUFFIX.test(parts[parts.length - 1] as string)) {
    suffixes.unshift(parts.pop() as string);
  }
  if (parts.length <= 1) return [...parts, ...suffixes].join(" ").toLowerCase();

  const surname = parts.pop() as string;
  const given = [...parts, ...suffixes].join(" ");
  return `${surname}, ${given}`.toLowerCase();
}

export function generateNameSort(nameDisplay: string): string {
  const trimmed = nameDisplay.trim();
  if (trimmed === "") return "";

  const segments = trimmed.split(",").map((s) => s.trim()).filter(Boolean);

  // "John Gottman, PhD" is one person, not a surname followed by given names.
  while (segments.length > 1 && TRAILING_CREDENTIAL.test(segments[segments.length - 1] as string)) {
    segments.pop();
  }

  // Three or more segments is a list of people, not "Last, First". File it
  // under the first author listed — hoisting the last word would file it under
  // the surname of whoever happens to appear last.
  if (segments.length >= 3) return invertSingleName(segments[0] as string);

  // Exactly two segments is the cataloguing convention "Last, First": already
  // in sort order, so normalize rather than invert it a second time.
  if (segments.length === 2) {
    return `${segments[0] as string}, ${(segments[1] as string).replace(/\s+/g, " ")}`.toLowerCase();
  }

  return invertSingleName(segments[0] ?? trimmed);
}
