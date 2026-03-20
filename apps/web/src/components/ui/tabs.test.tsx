// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

it("renders tabs with triggers and content", () => {
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Content A</TabsContent>
      <TabsContent value="b">Content B</TabsContent>
    </Tabs>,
  );
  expect(screen.getByText("Tab A")).toBeTruthy();
  expect(screen.getByText("Tab B")).toBeTruthy();
  expect(screen.getByText("Content A")).toBeTruthy();
});

it("applies data-slot attributes", () => {
  render(
    <Tabs defaultValue="x">
      <TabsList>
        <TabsTrigger value="x">Trigger</TabsTrigger>
      </TabsList>
      <TabsContent value="x">Body</TabsContent>
    </Tabs>,
  );
  expect(screen.getByText("Trigger").getAttribute("data-slot")).toBe("tabs-trigger");
  expect(screen.getByText("Body").getAttribute("data-slot")).toBe("tabs-content");
});

it("forwards custom className to TabsList", () => {
  render(
    <Tabs defaultValue="x">
      <TabsList className="my-custom-class">
        <TabsTrigger value="x">T</TabsTrigger>
      </TabsList>
      <TabsContent value="x">C</TabsContent>
    </Tabs>,
  );
  const list = screen.getByRole("tablist");
  expect(list.className).toContain("my-custom-class");
});
