// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from "./select";

describe("Select", () => {
  it("renders and opens select", async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select option" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Options</SelectLabel>
            <SelectItem value="a">Option A</SelectItem>
            <SelectSeparator />
            <SelectItem value="b">Option B</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    );
    expect(screen.getByText("Select option")).toBeTruthy();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Option A")).toBeTruthy();
  });

  it("renders SelectContent with position=popper", async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Popper select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="x">Popper Option</SelectItem>
        </SelectContent>
      </Select>
    );
    expect(screen.getByText("Popper select")).toBeTruthy();
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Popper Option")).toBeTruthy();
  });

  it("renders SelectScrollUpButton inside SelectContent", async () => {
    const user = userEvent.setup();
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Scroll test" />
        </SelectTrigger>
        <SelectContent>
          <SelectScrollUpButton />
          <SelectItem value="a">Option A</SelectItem>
          <SelectScrollDownButton />
        </SelectContent>
      </Select>
    );
    await user.click(screen.getByRole("combobox"));
    // SelectContent internally renders scroll buttons - just verify it opens
    expect(screen.getByText("Option A")).toBeTruthy();
  });
});
