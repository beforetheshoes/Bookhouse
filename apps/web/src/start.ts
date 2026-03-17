import { createStart } from "@tanstack/react-start";
import { createMiddleware } from "@tanstack/react-start";

const authMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next }) => {
    const { getCurrentUser } = await import("./lib/auth-server");
    const user = await getCurrentUser();

    return next({
      context: {
        auth: {
          user,
        },
      },
    });
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}));

export default startInstance;
