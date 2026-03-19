// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "./card";

it("renders card with all subcomponents", () => {
  render(
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
        <CardDescription>Description</CardDescription>
        <CardAction>Action</CardAction>
      </CardHeader>
      <CardContent>Content</CardContent>
      <CardFooter>Footer</CardFooter>
    </Card>
  );
  expect(screen.getByText("Title")).toBeTruthy();
  expect(screen.getByText("Description")).toBeTruthy();
  expect(screen.getByText("Action")).toBeTruthy();
  expect(screen.getByText("Content")).toBeTruthy();
  expect(screen.getByText("Footer")).toBeTruthy();
});

it("renders Card with correct data-slot attribute", () => {
  const { container } = render(<Card>Card</Card>);
  const el = container.firstChild as HTMLElement;
  expect(el.getAttribute("data-slot")).toBe("card");
});

it("renders CardTitle with correct data-slot attribute", () => {
  render(<CardTitle>My Title</CardTitle>);
  const el = screen.getByText("My Title");
  expect(el.getAttribute("data-slot")).toBe("card-title");
});

it("renders CardContent with correct data-slot attribute", () => {
  render(<CardContent>My Content</CardContent>);
  const el = screen.getByText("My Content");
  expect(el.getAttribute("data-slot")).toBe("card-content");
});
