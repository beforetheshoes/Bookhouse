// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./dialog";

describe("Dialog", () => {
  it("renders trigger and opens dialog on click", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription>Description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>Close</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Open")).toBeTruthy();
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Title")).toBeTruthy();
    expect(screen.getByText("Description")).toBeTruthy();
  });

  it("renders DialogContent with showCloseButton=false (hides close button)", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>No Close Button</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("No Close Button")).toBeTruthy();
    // The close button should not be rendered
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("renders DialogFooter with showCloseButton=true", async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Footer Test</DialogTitle>
          <DialogFooter showCloseButton={true}>
            <span>Footer content</span>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Footer content")).toBeTruthy();
    expect(screen.getByText("Close")).toBeTruthy();
  });
});
