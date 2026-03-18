import {
  Outlet,
  createRootRoute,
  ErrorComponent,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

export const Route = createRootRoute({
  head: () => ({
    links: [
      {
        href: "/favicon.svg",
        rel: "icon",
        type: "image/svg+xml",
      },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Bookhouse" },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});

export function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

function RootNotFoundComponent() {
  return (
    <div className="p-6">
      <p>Page not found.</p>
    </div>
  );
}

function RootErrorComponent(props: { error: Error }) {
  console.error("Root route error", props.error);

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold">Application error</h1>
      <ErrorComponent {...props} />
    </div>
  );
}
