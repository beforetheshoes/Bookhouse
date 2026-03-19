// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "./sheet";

describe("Sheet", () => {
  it("renders trigger and opens sheet", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet Description</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText("Open Sheet")).toBeTruthy();
    await user.click(screen.getByText("Open Sheet"));
    expect(screen.getByText("Sheet Title")).toBeTruthy();
    expect(screen.getByText("Sheet Description")).toBeTruthy();
  });

  it("renders SheetContent with side=left", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open Left</SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Left Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    await user.click(screen.getByText("Open Left"));
    expect(screen.getByText("Left Sheet")).toBeTruthy();
  });

  it("renders SheetContent with side=top", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open Top</SheetTrigger>
        <SheetContent side="top">
          <SheetTitle>Top Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    await user.click(screen.getByText("Open Top"));
    expect(screen.getByText("Top Sheet")).toBeTruthy();
  });

  it("renders SheetContent with side=bottom", async () => {
    const user = userEvent.setup();
    render(
      <Sheet>
        <SheetTrigger>Open Bottom</SheetTrigger>
        <SheetContent side="bottom">
          <SheetTitle>Bottom Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    await user.click(screen.getByText("Open Bottom"));
    expect(screen.getByText("Bottom Sheet")).toBeTruthy();
  });
});
