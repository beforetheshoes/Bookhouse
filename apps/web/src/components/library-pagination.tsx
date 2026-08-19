import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface LibraryPaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function LibraryPagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: LibraryPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div
      data-testid="library-pagination"
      className="sticky bottom-0 z-20 flex flex-wrap items-center justify-center gap-2 border-t bg-background px-2 py-1.5 sm:gap-4 md:static md:justify-between md:border-0 md:py-0"
    >
      <div className="hidden text-sm text-muted-foreground sm:block">
        {String(totalCount)} row(s) total
      </div>
      <div data-testid="library-pagination-nav" className="flex flex-wrap items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <p className="hidden text-sm font-medium whitespace-nowrap sm:block">Rows per page</p>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => {
              onPageSizeChange(Number(value));
            }}
          >
            <SelectTrigger className="w-[70px]">
              <SelectValue placeholder={String(pageSize)} />
            </SelectTrigger>
            <SelectContent side="top">
              {[20, 30, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm font-medium whitespace-nowrap">
          Page {String(page)} of {String(totalPages)}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            className="hidden size-9 p-0 lg:flex lg:size-8"
            onClick={() => { onPageChange(1); }}
            disabled={page <= 1}
            aria-label="Go to first page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="size-9 p-0 lg:size-8"
            onClick={() => { onPageChange(page - 1); }}
            disabled={page <= 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="size-9 p-0 lg:size-8"
            onClick={() => { onPageChange(page + 1); }}
            disabled={page >= totalPages}
            aria-label="Go to next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden size-9 p-0 lg:flex lg:size-8"
            onClick={() => { onPageChange(totalPages); }}
            disabled={page >= totalPages}
            aria-label="Go to last page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
