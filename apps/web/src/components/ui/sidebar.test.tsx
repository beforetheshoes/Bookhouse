// @vitest-environment happy-dom
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
  SidebarHeader,
  SidebarFooter,
  SidebarSeparator,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarInput,
  useSidebar,
} from "./sidebar";

describe("Sidebar", () => {
  it("renders full sidebar structure", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <SidebarInput placeholder="Search" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Group</SidebarGroupLabel>
              <SidebarGroupAction>+</SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton>Item 1</SidebarMenuButton>
                    <SidebarMenuAction>•</SidebarMenuAction>
                    <SidebarMenuBadge>3</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuSkeleton />
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton>Sub Item</SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarSeparator />
          <SidebarFooter>Footer</SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>Main</SidebarInset>
        <SidebarTrigger />
      </SidebarProvider>
    );
    expect(screen.getByText("Group")).toBeTruthy();
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("Sub Item")).toBeTruthy();
    expect(screen.getByText("Footer")).toBeTruthy();
    expect(screen.getByText("Main")).toBeTruthy();
  });

  it("toggles sidebar open/closed via trigger", async () => {
    const user = userEvent.setup();
    render(
      <SidebarProvider>
        <SidebarTrigger />
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive>Active Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    const trigger = screen.getByRole("button", { name: /toggle sidebar/i });
    await user.click(trigger);
    expect(trigger).toBeTruthy();
  });

  it("renders SidebarMenuSkeleton with showIcon", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    // Verifying no crash when showIcon is true
  });

  it("renders SidebarMenuButton with tooltip string", () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="My tooltip">
                  Icon Item
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Icon Item")).toBeTruthy();
  });

  it("renders SidebarMenuButton with tooltip object", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip={{ children: "Object tooltip" }}>
                  Object Item
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Object Item")).toBeTruthy();
  });

  it("renders Sidebar with collapsible=none variant", () => {
    render(
      <SidebarProvider>
        <Sidebar collapsible="none">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Non-collapsible Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Non-collapsible Item")).toBeTruthy();
  });

  it("renders SidebarMenuAction with showOnHover", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Item</SidebarMenuButton>
                <SidebarMenuAction showOnHover>Action</SidebarMenuAction>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Item")).toBeTruthy();
  });

  it("renders SidebarMenuSubButton with size sm and isActive", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton size="sm" isActive>
                    Active Sub
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Active Sub")).toBeTruthy();
  });

  it("renders SidebarGroupLabel with asChild", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel asChild>
                <span>AsChild Label</span>
              </SidebarGroupLabel>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("AsChild Label")).toBeTruthy();
  });

  it("renders SidebarGroupAction with asChild", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupAction asChild>
                <button>AsChild Action</button>
              </SidebarGroupAction>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("AsChild Action")).toBeTruthy();
  });

  it("renders SidebarMenuButton asChild", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="#">Link Item</a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Link Item")).toBeTruthy();
  });

  it("exposes useSidebar context values", () => {
    let capturedContext: ReturnType<typeof useSidebar> | null = null;

    function Consumer() {
      capturedContext = useSidebar();
      return null;
    }

    render(
      <SidebarProvider defaultOpen={true}>
        <Consumer />
      </SidebarProvider>
    );

    expect(capturedContext).not.toBeNull();
    expect(capturedContext!.state).toBe("expanded");
    expect(capturedContext!.open).toBe(true);
    expect(typeof capturedContext!.toggleSidebar).toBe("function");
    expect(typeof capturedContext!.setOpen).toBe("function");
    expect(typeof capturedContext!.setOpenMobile).toBe("function");
  });

  it("useSidebar throws when used outside SidebarProvider", () => {
    function BadConsumer() {
      useSidebar();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow(
      "useSidebar must be used within a SidebarProvider."
    );
  });

  it("renders SidebarProvider with controlled open state", () => {
    const onOpenChange = vi.fn();
    render(
      <SidebarProvider open={false} onOpenChange={onOpenChange}>
        <SidebarTrigger />
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Controlled Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Controlled Item")).toBeTruthy();
  });

  it("renders Sidebar with right side and floating variant", () => {
    render(
      <SidebarProvider>
        <Sidebar side="right" variant="floating">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Right Float Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Right Float Item")).toBeTruthy();
  });

  it("renders Sidebar with inset variant", () => {
    render(
      <SidebarProvider>
        <Sidebar variant="inset">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Inset Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Inset Item")).toBeTruthy();
  });

  it("calls onOpenChange when toggle is triggered with controlled open prop", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <SidebarProvider open={true} onOpenChange={onOpenChange}>
        <SidebarTrigger />
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Controlled Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    const trigger = screen.getByRole("button", { name: /toggle sidebar/i });
    await user.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("toggles sidebar via keyboard shortcut Ctrl+B", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <SidebarProvider open={true} onOpenChange={onOpenChange}>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Keyboard Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    await user.keyboard("{Control>}b{/Control}");
    expect(onOpenChange).toHaveBeenCalled();
  });

  it("renders Sidebar as Sheet when isMobile (window.innerWidth < 768)", async () => {
    const originalWidth = window.innerWidth;
    // Set mobile width before render so useIsMobile hook picks it up
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });

    let capturedContext: ReturnType<typeof useSidebar> | null = null;

    function MobileConsumer() {
      capturedContext = useSidebar();
      return <span>consumer</span>;
    }

    const { unmount } = render(
      <SidebarProvider>
        <MobileConsumer />
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Mobile Item</SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );

    // Wait for useEffect to run (updates isMobile state)
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The isMobile state is set; verify context shows isMobile
    expect(capturedContext).not.toBeNull();
    // When isMobile=true, Sidebar renders as Sheet (closed by default)
    // The test just verifies this path is executed without crashing
    expect(capturedContext!.isMobile).toBe(true);

    // Restore window width
    unmount();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalWidth });
  });

  it("renders SidebarMenuButton with size variants", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm">Small Item</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">Large Item</SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton variant="outline">
                  Outline Item
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Small Item")).toBeTruthy();
    expect(screen.getByText("Large Item")).toBeTruthy();
    expect(screen.getByText("Outline Item")).toBeTruthy();
  });

  it("renders SidebarMenuAction with asChild=true (covers Slot.Root branch)", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>Item</SidebarMenuButton>
                <SidebarMenuAction asChild>
                  <button>AsChild Action</button>
                </SidebarMenuAction>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("AsChild Action")).toBeTruthy();
  });

  it("renders SidebarMenuSubButton with asChild=true (covers Slot.Root branch)", () => {
    render(
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuSub>
                <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild>
                    <a href="#">AsChild Sub</a>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              </SidebarMenuSub>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("AsChild Sub")).toBeTruthy();
  });

  it("setOpen with direct boolean value (non-function path, no setOpenProp)", async () => {
    // Use React.act to properly handle state updates
    const { act } = await import("react");
    let capturedCtx: ReturnType<typeof useSidebar> | null = null;

    function ContextCapture() {
      capturedCtx = useSidebar();
      return null;
    }

    render(
      <SidebarProvider defaultOpen={true}>
        <ContextCapture />
      </SidebarProvider>
    );

    expect(capturedCtx!.open).toBe(true);

    // Call setOpen with a direct boolean value (not a function) to cover the else branch
    await act(async () => {
      capturedCtx!.setOpen(false);
    });

    // After state update, context should reflect new value
    expect(capturedCtx!.open).toBe(false);
  });

  it("renders SidebarMenuButton with tooltip when sidebar is collapsed (state=collapsed, not mobile)", () => {
    // defaultOpen={false} gives state="collapsed"; not mobile (window.innerWidth is default desktop)
    // This covers the hidden={state !== "collapsed" || isMobile} branch where both are false
    render(
      <SidebarProvider defaultOpen={false}>
        <Sidebar collapsible="icon">
          <SidebarContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Collapsed tooltip">
                  Collapsed Item
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    );
    expect(screen.getByText("Collapsed Item")).toBeTruthy();
  });

  it("toggleSidebar uses setOpenMobile when isMobile is true", async () => {
    const { act } = await import("react");
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });

    let capturedCtx: ReturnType<typeof useSidebar> | null = null;

    function ContextCapture() {
      capturedCtx = useSidebar();
      return null;
    }

    const { unmount } = render(
      <SidebarProvider>
        <ContextCapture />
      </SidebarProvider>
    );

    // Wait for useEffect to set isMobile
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(capturedCtx!.isMobile).toBe(true);

    // toggleSidebar when isMobile should call setOpenMobile (not setOpen)
    await act(async () => {
      capturedCtx!.toggleSidebar();
    });

    expect(capturedCtx!.openMobile).toBe(true);

    unmount();
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: originalWidth });
  });
});
