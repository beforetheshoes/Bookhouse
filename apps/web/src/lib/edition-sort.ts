export function editionSortKey(e: { publisher: string | null; editionFiles: { fileAsset: { basename: string } }[] }): string {
  const pub = (e.publisher ?? "").toLowerCase();
  const file = e.editionFiles[0]?.fileAsset.basename ?? "";
  return `${pub}\0${file}`;
}

export function sortEditionsByKey<T extends { publisher: string | null; editionFiles: { fileAsset: { basename: string } }[] }>(editions: T[]): T[] {
  return [...editions].sort((a, b) => editionSortKey(a).localeCompare(editionSortKey(b)));
}
