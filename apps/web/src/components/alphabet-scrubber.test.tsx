// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AlphabetScrubber, SCRUBBER_LETTERS } from "./alphabet-scrubber";

/** happy-dom does no layout, so the rail reports 0px until told otherwise. */
function giveRailHeight(el: Element, top: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    top, height, bottom: top + height, left: 0, right: 20, width: 20, x: 0, y: top,
    toJSON: () => ({}),
  });
}

describe("AlphabetScrubber", () => {
  it("offers every letter plus a bucket for what sorts before A", () => {
    render(<AlphabetScrubber onJump={vi.fn()} />);
    expect(SCRUBBER_LETTERS).toHaveLength(27);
    expect(screen.getByRole("button", { name: "#" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Z" })).toBeTruthy();
  });

  it("jumps when a letter is tapped", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    fireEvent.click(screen.getByRole("button", { name: "M" }));
    expect(onJump).toHaveBeenCalledWith("M");
  });

  it("jumps to the letter under the finger while dragging", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    const rail = screen.getByTestId("alphabet-scrubber");
    rail.setPointerCapture = vi.fn();
    giveRailHeight(rail, 0, 270); // 10px per letter

    fireEvent.pointerDown(rail, { clientY: 5, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("#");
    fireEvent.pointerMove(rail, { clientY: 135, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("M");
    fireEvent.pointerMove(rail, { clientY: 265, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("Z");
  });

  it("reports a letter once however far the finger moves inside it", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    const rail = screen.getByTestId("alphabet-scrubber");
    rail.setPointerCapture = vi.fn();
    giveRailHeight(rail, 0, 270);

    fireEvent.pointerDown(rail, { clientY: 131, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientY: 133, pointerId: 1 });
    fireEvent.pointerMove(rail, { clientY: 139, pointerId: 1 });
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith("M");
  });

  it("ignores movement that is not part of a drag", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    const rail = screen.getByTestId("alphabet-scrubber");
    giveRailHeight(rail, 0, 270);
    fireEvent.pointerMove(rail, { clientY: 135, pointerId: 1 });
    expect(onJump).not.toHaveBeenCalled();
  });

  it("clamps a finger dragged past either end", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    const rail = screen.getByTestId("alphabet-scrubber");
    rail.setPointerCapture = vi.fn();
    giveRailHeight(rail, 100, 270);

    fireEvent.pointerDown(rail, { clientY: -500, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("#");
    fireEvent.pointerMove(rail, { clientY: 5000, pointerId: 1 });
    expect(onJump).toHaveBeenLastCalledWith("Z");
  });

  it("starts a fresh drag after the finger lifts", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    const rail = screen.getByTestId("alphabet-scrubber");
    rail.setPointerCapture = vi.fn();
    giveRailHeight(rail, 0, 270);

    fireEvent.pointerDown(rail, { clientY: 135, pointerId: 1 });
    fireEvent.pointerUp(rail, { pointerId: 1 });
    fireEvent.pointerDown(rail, { clientY: 135, pointerId: 1 });
    expect(onJump).toHaveBeenCalledTimes(2);

    fireEvent.pointerCancel(rail, { pointerId: 1 });
    fireEvent.pointerMove(rail, { clientY: 5, pointerId: 1 });
    expect(onJump).toHaveBeenCalledTimes(2);
  });

  it("reports nothing when the rail has no height to divide", () => {
    const onJump = vi.fn();
    render(<AlphabetScrubber onJump={onJump} />);
    const rail = screen.getByTestId("alphabet-scrubber");
    rail.setPointerCapture = vi.fn();
    giveRailHeight(rail, 0, 0);
    fireEvent.pointerDown(rail, { clientY: 10, pointerId: 1 });
    expect(onJump).not.toHaveBeenCalled();
  });

  it("marks the letter whose jump is still resolving", () => {
    render(<AlphabetScrubber onJump={vi.fn()} pending="M" />);
    expect(screen.getByRole("button", { name: "M" }).getAttribute("data-active")).toBe("true");
    expect(screen.getByRole("button", { name: "N" }).getAttribute("data-active")).toBe("false");
  });
});
