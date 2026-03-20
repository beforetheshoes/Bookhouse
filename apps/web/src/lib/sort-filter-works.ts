import type { LibraryWork } from "~/lib/server-fns/library";

export type SortOption = "title-asc" | "title-desc" | "author-asc" | "author-desc" | "recent";

function getAuthors(work: LibraryWork): string {
  const authors = work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ") || "—";
}

export function sortAndFilterWorks(
  works: LibraryWork[],
  search: string,
  sort: SortOption,
): LibraryWork[] {
  let result = works;

  if (search) {
    const q = search.toLowerCase();
    result = result.filter(
      (w) =>
        w.titleDisplay.toLowerCase().includes(q) ||
        getAuthors(w).toLowerCase().includes(q),
    );
  }

  return [...result].sort((a, b) => {
    switch (sort) {
      case "title-asc":
        return (a.sortTitle ?? a.titleCanonical).localeCompare(b.sortTitle ?? b.titleCanonical);
      case "title-desc":
        return (b.sortTitle ?? b.titleCanonical).localeCompare(a.sortTitle ?? a.titleCanonical);
      case "author-asc":
        return getAuthors(a).localeCompare(getAuthors(b));
      case "author-desc":
        return getAuthors(b).localeCompare(getAuthors(a));
      case "recent":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });
}
