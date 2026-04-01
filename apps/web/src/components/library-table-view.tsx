import type { ColumnDef, OnChangeFn, RowSelectionState, SortingState, Updater } from "@tanstack/react-table";
import { AlignJustify, Pencil, WrapText } from "lucide-react";
import { VirtualizedDataTable } from "~/components/data-table";
import { DataTableColumnPicker } from "~/components/data-table/data-table-column-picker";
import { Button } from "~/components/ui/button";
import { COLUMN_PICKER_ITEMS } from "~/lib/library-columns";

interface LibraryTableViewProps<T> {
  works: T[];
  columns: ColumnDef<T>[];
  editMode: boolean;
  onEditModeToggle: () => void;
  tablePrefs: { columnVisibility: Record<string, boolean>; textOverflow: "wrap" | "truncate" };
  onColumnToggle: (columnId: string) => void;
  onTextOverflowToggle: () => void;
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  sorting: SortingState;
  onSortingChange: (updater: Updater<SortingState>) => void;
}

export function LibraryTableView<T>({
  works,
  columns,
  editMode,
  onEditModeToggle,
  tablePrefs,
  onColumnToggle,
  onTextOverflowToggle,
  rowSelection,
  onRowSelectionChange,
  sorting,
  onSortingChange,
}: LibraryTableViewProps<T>) {
  return (
    <>
      <div className="flex items-center gap-2 justify-end">
        <Button
          data-testid="edit-mode-toggle"
          variant={editMode ? "default" : "outline"}
          size="sm"
          onClick={onEditModeToggle}
          aria-label={editMode ? "Exit edit mode" : "Enter edit mode"}
        >
          <Pencil className="mr-2 h-4 w-4" />
          {editMode ? "Done" : "Edit"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onTextOverflowToggle}
          aria-label={tablePrefs.textOverflow === "truncate" ? "Wrap text" : "Truncate text"}
        >
          {tablePrefs.textOverflow === "truncate" ? (
            <WrapText className="mr-2 h-4 w-4" />
          ) : (
            <AlignJustify className="mr-2 h-4 w-4" />
          )}
          {tablePrefs.textOverflow === "truncate" ? "Wrap" : "Truncate"}
        </Button>
        <DataTableColumnPicker
          columns={COLUMN_PICKER_ITEMS}
          columnVisibility={tablePrefs.columnVisibility}
          onToggle={onColumnToggle}
        />
      </div>
      <VirtualizedDataTable
        columns={columns}
        data={works}
        showPagination={false}
        columnVisibility={tablePrefs.columnVisibility}
        textOverflow={tablePrefs.textOverflow}
        rowSelection={rowSelection}
        onRowSelectionChange={onRowSelectionChange}
        sorting={sorting}
        onSortingChange={onSortingChange}
      />
    </>
  );
}
