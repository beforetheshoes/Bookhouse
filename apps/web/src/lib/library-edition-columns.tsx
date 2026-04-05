import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { DataTableColumnHeader } from "~/components/data-table";
import { EditableTableCell } from "~/components/editable-table-cell";
import { formatDuration } from "~/components/enrichment-dialog";
import { updateEditionServerFn, updateWorkAuthorsServerFn, updateEditionNarratorsServerFn } from "~/lib/server-fns/editing";
import type { LibraryEdition } from "~/lib/server-fns/library";

type ContributorEdition = {
  contributors: { role: string; contributor: { nameDisplay: string } }[];
};

type EditionWithWorkAuthors = ContributorEdition & {
  work: {
    editions: {
      contributors: { role: string; contributor: { nameDisplay: string } }[];
    }[];
  };
};

export function getEditionAuthors(edition: EditionWithWorkAuthors): string {
  // Aggregate authors from ALL editions of the work (same as Works view)
  const authors = edition.work.editions
    .flatMap((e) => e.contributors)
    .filter((c) => c.role === "AUTHOR")
    .map((c) => c.contributor.nameDisplay);
  return [...new Set(authors)].join(", ") || "\u2014";
}

export function getEditionNarrators(edition: ContributorEdition): string {
  const narrators = edition.contributors
    .filter((c) => c.role === "NARRATOR")
    .map((c) => c.contributor.nameDisplay);
  return narrators.length > 0 ? narrators.join(", ") : "\u2014";
}

export function formatPagesOrDuration(
  formatFamily: string,
  pageCount: number | null,
  duration: number | null,
): string {
  if (formatFamily === "AUDIOBOOK") {
    return duration != null ? formatDuration(duration) : "\u2014";
  }
  if (pageCount != null) {
    return pageCount === 1 ? "1 page" : `${String(pageCount)} pages`;
  }
  return "\u2014";
}

export const EDITION_COLUMN_PICKER_ITEMS = [
  { id: "authors", label: "Author(s)" },
  { id: "format", label: "Format" },
  { id: "publisher", label: "Publisher" },
  { id: "publishDate", label: "Publish Date" },
  { id: "pagesOrDuration", label: "Pages / Duration" },
  { id: "narrators", label: "Narrator(s)" },
  { id: "isbn13", label: "ISBN-13" },
  { id: "isbn10", label: "ISBN-10" },
  { id: "asin", label: "ASIN" },
];

export function getEditionColumns(editMode: boolean, router: { invalidate: () => void }): ColumnDef<LibraryEdition>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => { table.toggleAllPageRowsSelected(e.target.checked); }}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(e) => { row.toggleSelected(e.target.checked); }}
          aria-label="Select row"
        />
      ),
      size: 40,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "titleDisplay",
      accessorFn: (row) => row.work.titleDisplay,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Title" />
      ),
      cell: ({ row }) => (
        <Link
          to="/library/$workId"
          params={{ workId: row.original.workId }}
          search={{ page: 1, pageSize: 50, sort: "title-asc" as const }}
          className="flex items-center gap-2"
        >
          {row.original.work.titleDisplay}
        </Link>
      ),
      size: 300,
      enableHiding: false,
    },
    {
      id: "authors",
      accessorFn: (row) => getEditionAuthors(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Author(s)" />
      ),
      cell: ({ row }) => {
        const authorsStr = getEditionAuthors(row.original);
        if (editMode) {
          return (
            <EditableTableCell
              value={authorsStr === "\u2014" ? "" : authorsStr}
              editing={true}
              onSave={async (val) => {
                const authors = val.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
                if (authors.length === 0) return;
                await updateWorkAuthorsServerFn({ data: { workId: row.original.workId, authors } });
                router.invalidate();
              }}
            />
          );
        }
        return <span>{authorsStr}</span>;
      },
      size: 200,
    },
    {
      id: "format",
      accessorFn: (row) => row.formatFamily,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Format" />
      ),
      cell: ({ row }) => (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {row.original.formatFamily}
        </Badge>
      ),
      size: 120,
    },
    {
      id: "publisher",
      accessorFn: (row) => row.publisher ?? "\u2014",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Publisher" />
      ),
      cell: ({ row }) => {
        if (editMode) {
          return (
            <EditableTableCell
              value={row.original.publisher ?? ""}
              editing={true}
              onSave={async (val) => {
                await updateEditionServerFn({ data: { editionId: row.original.id, fields: { publisher: val || null } } });
                router.invalidate();
              }}
            />
          );
        }
        return <span>{row.original.publisher ?? "\u2014"}</span>;
      },
      size: 180,
    },
    {
      id: "publishDate",
      accessorFn: (row) => row.publishedAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Publish Date" />
      ),
      cell: ({ row }) => {
        if (editMode) {
          const dateStr = row.original.publishedAt
            ? new Date(row.original.publishedAt).toISOString().slice(0, 10)
            : "";
          return (
            <EditableTableCell
              value={dateStr}
              editing={true}
              onSave={async (val) => {
                await updateEditionServerFn({ data: { editionId: row.original.id, fields: { publishedAt: val || null } } });
                router.invalidate();
              }}
            />
          );
        }
        return (
          <span>
            {row.original.publishedAt
              ? new Date(row.original.publishedAt).toLocaleDateString()
              : "\u2014"}
          </span>
        );
      },
      size: 130,
    },
    {
      id: "pagesOrDuration",
      accessorFn: (row) => formatPagesOrDuration(row.formatFamily, row.pageCount, row.duration),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Pages / Duration" />
      ),
      cell: ({ row }) => {
        if (editMode) {
          const isAudiobook = row.original.formatFamily === "AUDIOBOOK";
          const rawVal = isAudiobook
            ? (row.original.duration != null ? String(row.original.duration) : "")
            : (row.original.pageCount != null ? String(row.original.pageCount) : "");
          const field = isAudiobook ? "duration" : "pageCount";
          return (
            <EditableTableCell
              value={rawVal}
              editing={true}
              onSave={async (val) => {
                await updateEditionServerFn({ data: { editionId: row.original.id, fields: { [field]: val || null } } });
                router.invalidate();
              }}
            />
          );
        }
        return (
          <span>
            {formatPagesOrDuration(
              row.original.formatFamily,
              row.original.pageCount,
              row.original.duration,
            )}
          </span>
        );
      },
      size: 140,
    },
    {
      id: "narrators",
      accessorFn: (row) => getEditionNarrators(row),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Narrator(s)" />
      ),
      cell: ({ row }) => {
        const narratorsStr = getEditionNarrators(row.original);
        if (editMode) {
          return (
            <EditableTableCell
              value={narratorsStr === "\u2014" ? "" : narratorsStr}
              editing={true}
              onSave={async (val) => {
                const narrators = val.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
                await updateEditionNarratorsServerFn({ data: { editionId: row.original.id, narrators } });
                router.invalidate();
              }}
            />
          );
        }
        return <span>{narratorsStr}</span>;
      },
      size: 180,
    },
    {
      id: "isbn13",
      accessorFn: (row) => row.isbn13 ?? "\u2014",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="ISBN-13" />
      ),
      cell: ({ row }) => {
        if (editMode) {
          return (
            <EditableTableCell
              value={row.original.isbn13 ?? ""}
              editing={true}
              onSave={async (val) => {
                await updateEditionServerFn({ data: { editionId: row.original.id, fields: { isbn13: val || null } } });
                router.invalidate();
              }}
            />
          );
        }
        return <span>{row.original.isbn13 ?? "\u2014"}</span>;
      },
      size: 150,
    },
    {
      id: "isbn10",
      accessorFn: (row) => row.isbn10 ?? "\u2014",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="ISBN-10" />
      ),
      cell: ({ row }) => {
        if (editMode) {
          return (
            <EditableTableCell
              value={row.original.isbn10 ?? ""}
              editing={true}
              onSave={async (val) => {
                await updateEditionServerFn({ data: { editionId: row.original.id, fields: { isbn10: val || null } } });
                router.invalidate();
              }}
            />
          );
        }
        return <span>{row.original.isbn10 ?? "\u2014"}</span>;
      },
      size: 130,
    },
    {
      id: "asin",
      accessorFn: (row) => row.asin ?? "\u2014",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="ASIN" />
      ),
      cell: ({ row }) => {
        if (editMode) {
          return (
            <EditableTableCell
              value={row.original.asin ?? ""}
              editing={true}
              onSave={async (val) => {
                await updateEditionServerFn({ data: { editionId: row.original.id, fields: { asin: val || null } } });
                router.invalidate();
              }}
            />
          );
        }
        return <span>{row.original.asin ?? "\u2014"}</span>;
      },
      size: 130,
    },
  ];
}
