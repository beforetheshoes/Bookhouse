import { Settings2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface ColumnPickerColumn {
  id: string;
  label: string;
}

interface DataTableColumnPickerProps {
  columns: ColumnPickerColumn[];
  columnVisibility: Record<string, boolean>;
  onToggle: (columnId: string) => void;
}

export function DataTableColumnPicker({
  columns,
  columnVisibility,
  onToggle,
}: DataTableColumnPickerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.id}
            checked={columnVisibility[col.id] !== false}
            onCheckedChange={() => { onToggle(col.id); }}
          >
            {col.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
