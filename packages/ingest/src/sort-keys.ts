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

export function generateNameSort(nameDisplay: string): string {
  const trimmed = nameDisplay.trim();
  if (trimmed === "") return "";

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed.toLowerCase();

  const last = parts.pop() as string;
  return `${last.toLowerCase()}, ${parts.join(" ").toLowerCase()}`;
}
