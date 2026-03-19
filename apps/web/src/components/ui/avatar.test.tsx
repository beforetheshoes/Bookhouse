// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { Avatar, AvatarImage, AvatarFallback, AvatarBadge, AvatarGroup, AvatarGroupCount } from "./avatar";

describe("Avatar", () => {
  it("renders avatar with fallback", () => {
    render(
      <Avatar>
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText("JD")).toBeTruthy();
  });

  it("renders avatar with image and fallback", () => {
    render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.jpg" alt="User" />
        <AvatarFallback>JD</AvatarFallback>
      </Avatar>
    );
    // Fallback should be in DOM (image might not load in test env)
    expect(screen.getByText("JD")).toBeTruthy();
  });

  it("renders AvatarBadge inside an Avatar", () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
        <AvatarBadge data-testid="badge" />
      </Avatar>
    );
    const badge = container.querySelector("[data-slot='avatar-badge']");
    expect(badge).toBeTruthy();
  });

  it("renders AvatarGroup with multiple avatars", () => {
    const { container } = render(
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>A1</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>A2</AvatarFallback>
        </Avatar>
      </AvatarGroup>
    );
    const group = container.querySelector("[data-slot='avatar-group']");
    expect(group).toBeTruthy();
    expect(screen.getByText("A1")).toBeTruthy();
    expect(screen.getByText("A2")).toBeTruthy();
  });

  it("renders AvatarGroupCount", () => {
    const { container } = render(
      <AvatarGroup>
        <AvatarGroupCount>+3</AvatarGroupCount>
      </AvatarGroup>
    );
    const count = container.querySelector("[data-slot='avatar-group-count']");
    expect(count).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
  });
});
