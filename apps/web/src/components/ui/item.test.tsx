// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./item";

it("renders an item with its default variant and size", () => {
  render(<Item>Row</Item>);
  const el = screen.getByText("Row");
  expect(el.getAttribute("data-variant")).toBe("default");
  expect(el.getAttribute("data-size")).toBe("default");
  expect(el.getAttribute("data-slot")).toBe("item");
});

it.each(["default", "outline", "muted"] as const)("renders the %s variant", (variant) => {
  render(<Item variant={variant}>Row {variant}</Item>);
  expect(screen.getByText(`Row ${variant}`).getAttribute("data-variant")).toBe(variant);
});

it.each(["default", "sm"] as const)("renders the %s size", (size) => {
  render(<Item size={size}>Sized {size}</Item>);
  expect(screen.getByText(`Sized ${size}`).getAttribute("data-size")).toBe(size);
});

it("renders as the child element with asChild", () => {
  render(
    <Item asChild>
      <a href="/work/1">Open</a>
    </Item>,
  );
  const link = screen.getByRole("link", { name: "Open" });
  expect(link.getAttribute("href")).toBe("/work/1");
  expect(link.getAttribute("data-slot")).toBe("item");
});

it("keeps a caller's className", () => {
  render(<Item className="border-destructive">Row</Item>);
  expect(screen.getByText("Row").className).toContain("border-destructive");
});

it("groups items and separates them", () => {
  const { container } = render(
    <ItemGroup>
      <Item>One</Item>
      <ItemSeparator />
      <Item>Two</Item>
    </ItemGroup>,
  );
  expect(container.querySelector('[data-slot="item-group"]')).toBeTruthy();
  expect(container.querySelector('[data-slot="item-separator"]')).toBeTruthy();
  expect(screen.getByText("One")).toBeTruthy();
  expect(screen.getByText("Two")).toBeTruthy();
});

it.each(["default", "icon", "image"] as const)("renders %s media", (variant) => {
  const { container } = render(<ItemMedia variant={variant}>M</ItemMedia>);
  const media = container.querySelector('[data-slot="item-media"]');
  expect(media?.getAttribute("data-variant")).toBe(variant);
});

it("renders content, title, description, actions, header and footer", () => {
  const { container } = render(
    <Item>
      <ItemHeader>Head</ItemHeader>
      <ItemContent>
        <ItemTitle>Title</ItemTitle>
        <ItemDescription>Description</ItemDescription>
      </ItemContent>
      <ItemActions>
        <button type="button">Act</button>
      </ItemActions>
      <ItemFooter>Foot</ItemFooter>
    </Item>,
  );
  for (const slot of [
    "item-header",
    "item-content",
    "item-title",
    "item-description",
    "item-actions",
    "item-footer",
  ]) {
    expect(container.querySelector(`[data-slot="${slot}"]`)).toBeTruthy();
  }
  expect(screen.getByRole("button", { name: "Act" })).toBeTruthy();
});
