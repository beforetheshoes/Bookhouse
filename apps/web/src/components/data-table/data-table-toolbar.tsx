import type { Table } from "@tanstack/react-table";
import { X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  filterColumn?: string;
  filterPlaceholder?: string;
}

export function DataTableToolbar<TData>({
  table,
  filterColumn,
  filterPlaceholder = "Filter...",
}: DataTableToolbarProps<TData>) {
  const column = filterColumn ? table.getColumn(filterColumn) : undefined;
  const filterValue = (column?.getFilterValue() as string) ?? "";
  const isFiltered = table.getState().columnFilters.length > 0;

  if (!filterColumn) return null;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          placeholder={filterPlaceholder}
          value={filterValue}
          onChange={(event) => column?.setFilterValue(event.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
