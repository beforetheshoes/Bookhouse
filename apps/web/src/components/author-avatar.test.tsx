// @vitest-environment happy-dom
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AuthorAvatar } from "./author-avatar";

vi.mock("lucide-react", () => ({
  Users: (props: Record<string, string>) => <svg data-testid="users-icon" {...props} />,
}));

describe("AuthorAvatar", () => {
  it("renders img when imagePath is set", () => {
    const { container } = render(<AuthorAvatar id="c1" imagePath="c1" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/api/authors/c1/thumb");
    expect(img?.getAttribute("loading")).toBe("lazy");
  });

  it("uses medium size when specified", () => {
    const { container } = render(<AuthorAvatar id="c1" imagePath="c1" size="medium" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/authors/c1/medium");
  });

  it("renders fallback icon when imagePath is null", () => {
    const { container, getByTestId } = render(<AuthorAvatar id="c1" imagePath={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(getByTestId("users-icon")).toBeTruthy();
  });

  it("renders fallback icon when img fails to load", () => {
    const { container, getByTestId } = render(<AuthorAvatar id="c1" imagePath="c1" />);
    const img = container.querySelector("img") as HTMLImageElement;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(getByTestId("users-icon")).toBeTruthy();
  });

  it("applies custom className", () => {
    const { container } = render(<AuthorAvatar id="c1" imagePath={null} className="size-16" />);
    const div = container.firstElementChild;
    expect(div?.className).toContain("size-16");
  });

  it("includes cache version in img src when provided", () => {
    const { container } = render(<AuthorAvatar id="c1" imagePath="c1" cacheVersion={3} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/api/authors/c1/thumb?v=3");
  });

  it("applies custom className to img", () => {
    const { container } = render(<AuthorAvatar id="c1" imagePath="c1" className="size-16" />);
    const img = container.querySelector("img");
    expect(img?.className).toContain("size-16");
  });
});
