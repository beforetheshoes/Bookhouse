// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "./tooltip";

it("renders tooltip trigger", () => {
  render(
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Tooltip text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
  expect(screen.getByText("Hover me")).toBeTruthy();
});
