// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./table";

it("renders a complete table", () => {
  render(
    <Table>
      <TableCaption>Caption</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Header</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Cell</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
  expect(screen.getByText("Cell")).toBeTruthy();
  expect(screen.getByText("Header")).toBeTruthy();
  expect(screen.getByText("Caption")).toBeTruthy();
});

it("renders a table with footer", () => {
  render(
    <Table>
      <TableBody>
        <TableRow>
          <TableCell>Data</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Footer</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
  expect(screen.getByText("Footer")).toBeTruthy();
});

it("renders Table with correct data-slot on inner table element", () => {
  const { container } = render(<Table />);
  const table = container.querySelector("table");
  expect(table?.getAttribute("data-slot")).toBe("table");
});

it("renders TableCell with correct data-slot attribute", () => {
  render(
    <table>
      <tbody>
        <tr>
          <TableCell>CellData</TableCell>
        </tr>
      </tbody>
    </table>
  );
  const cell = screen.getByText("CellData");
  expect(cell.getAttribute("data-slot")).toBe("table-cell");
});

it("forwards containerClassName to the scroll wrapper", () => {
  // The wrapper's overflow-x-auto computes overflow-y to auto, which makes it
  // the scrollport for any sticky descendant. Callers that own their own
  // scroller need to neutralise it or their sticky headers silently die.
  const { container } = render(<Table containerClassName="overflow-visible" />);
  const wrapper = container.querySelector('[data-slot="table-container"]');
  expect(wrapper?.className).toContain("overflow-visible");
});

it("keeps the default overflow wrapper when no containerClassName is given", () => {
  const { container } = render(<Table />);
  const wrapper = container.querySelector('[data-slot="table-container"]');
  expect(wrapper?.className).toContain("overflow-x-auto");
});
