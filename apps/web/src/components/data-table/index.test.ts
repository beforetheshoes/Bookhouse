// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { DataTable, DataTableColumnHeader, DataTablePagination, DataTableToolbar, VirtualizedDataTable, __loaded } from "./index";

it("exports all data table components", () => {
  expect(DataTable).toBeDefined();
  expect(DataTableColumnHeader).toBeDefined();
  expect(DataTablePagination).toBeDefined();
  expect(DataTableToolbar).toBeDefined();
  expect(VirtualizedDataTable).toBeDefined();
});

it("barrel is loaded", () => {
  expect(__loaded).toBe(true);
});
