import type { ColumnDef } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { Badge } from "~/components/ui/badge";
import { DataTableColumnHeader } from "~/components/data-table";
import { EditableTableCell } from "~/components/editable-table-cell";
import { ProgressBar } from "~/components/progress-bar";
import { updateWorkServerFn, updateWorkAuthorsServerFn } from "~/lib/server-fns/editing";
import { getAuthors } from "~/lib/sort-filter-works";
import type { LibraryWork } from "~/lib/server-fns/library";

export { getAuthors } from "~/lib/sort-filter-works";

export function getFormats(work: LibraryWork): string[] {
  return [...new Set(work.editions.map((e) => e.formatFamily))];
}

export const COLUMN_PICKER_ITEMS = [
  { id: "authors", label: "Author(s)" },
  { id: "progress", label: "Progress" },
  { id: "formats", label: "Format" },
];

export function getColumns(scanActive: boolean, editMode: boolean, router: { invalidate: () => void }, progressMap?: Record<string, number>): ColumnDef<LibraryWork>[] {
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
    accessorKey: "titleDisplay",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Title" />
    ),
    cell: ({ row }) => {
      if (editMode) {
        return (
          <EditableTableCell
            value={row.original.titleDisplay}
            editing={true}
            onSave={async (val) => {
              await updateWorkServerFn({ data: { workId: row.original.id, fields: { titleDisplay: val } } });
              router.invalidate();
            }}
          />
        );
      }
      return (
        <Link to="/library/$workId" params={{ workId: row.original.id }} search={{ page: 1, pageSize: 50, sort: "title-asc" as const }} className="flex items-center gap-2">
          {row.original.titleDisplay}
          {row.original.enrichmentStatus === "STUB" && scanActive && (
            <Badge variant="outline" className="animate-pulse px-1.5 py-0 text-[10px]">
              Processing&hellip;
            </Badge>
          )}
        </Link>
      );
    },
    size: 300,
    enableHiding: false,
  },
  {
    id: "authors",
    accessorFn: (row) => getAuthors(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Author(s)" />
    ),
    cell: ({ row }) => {
      const authorsStr = getAuthors(row.original);
      if (editMode) {
        return (
          <EditableTableCell
            value={authorsStr === "—" ? "" : authorsStr}
            editing={true}
            onSave={async (val) => {
              const authors = val.split(",").map((a) => a.trim()).filter((a) => a.length > 0);
              if (authors.length === 0) return;
              await updateWorkAuthorsServerFn({ data: { workId: row.original.id, authors } });
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
    id: "progress",
    header: () => <div className="w-full text-center">Progress</div>,
    cell: ({ row }) => {
      const percent = progressMap?.[row.original.id];
      if (percent == null) {
        return <div className="text-center text-xs text-muted-foreground">—</div>;
      }
      return (
        <div className="flex w-full items-center justify-center gap-2">
          <div className="w-14">
            <ProgressBar percent={percent} size="md" />
          </div>
          <span className="w-8 text-right text-xs text-muted-foreground">{String(percent)}%</span>
        </div>
      );
    },
    size: 120,
    enableSorting: false,
  },
  {
    id: "formats",
    accessorFn: (row) => getFormats(row).join(", "),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Format" />
    ),
    cell: ({ row }) =>
      getFormats(row.original).map((f) => (
        <Badge key={f} variant="secondary" className="mr-1 px-1.5 py-0 text-[10px]">
          {f}
        </Badge>
      )),
    size: 140,
    minSize: 140,
  },
  ];
}
