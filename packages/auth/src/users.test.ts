import { describe, expect, it, vi } from "vitest";
import { resolveAuthenticatedUser, upsertOidcUser } from "./users";

describe("user linking", () => {
  it("updates an existing identity-linked user", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "updated@example.com",
      name: "Updated Name",
      image: "https://avatar.example.com/pic.png",
    });
    const updateIdentity = vi.fn().mockResolvedValue(undefined);
    const db = {
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue({
              id: "identity-1",
              userId: "user-1",
              user: {
                id: "user-1",
                email: "reader@example.com",
                name: "Reader",
                image: null,
              },
            }),
            update: updateIdentity,
          },
          user: {
            update: updateUser,
          },
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: {
        secret: "a".repeat(32),
        issuer: "https://issuer.example.com",
        clientId: "bookhouse",
        clientSecret: "secret",
        appUrl: "http://localhost:3000",
        scopes: ["openid"],
      },
      claims: {
        sub: "subject-1",
        email: "updated@example.com",
        emailVerified: true,
        name: "Updated Name",
        preferredUsername: null,
        image: "https://avatar.example.com/pic.png",
        raw: { sub: "subject-1" },
      },
    });

    expect(updateUser).toHaveBeenCalled();
    expect(updateIdentity).toHaveBeenCalledWith({
      where: { id: "identity-1" },
      data: {
        metadata: { sub: "subject-1" },
      },
    });
    expect(user).toEqual({
      id: "user-1",
      email: "updated@example.com",
      name: "Updated Name",
      image: "https://avatar.example.com/pic.png",
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });
  });

  it("links by verified email when no identity exists", async () => {
    const createIdentity = vi.fn().mockResolvedValue(undefined);
    const createUser = vi.fn();
    const db = {
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: createIdentity,
          },
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "user-2",
              email: "reader@example.com",
              name: "Reader",
              image: null,
            }),
            create: createUser,
          },
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: {
        secret: "a".repeat(32),
        issuer: "https://issuer.example.com",
        clientId: "bookhouse",
        clientSecret: "secret",
        appUrl: "http://localhost:3000",
        scopes: ["openid"],
      },
      claims: {
        sub: "subject-2",
        email: "reader@example.com",
        emailVerified: true,
        name: "Reader",
        preferredUsername: "reader",
        image: null,
        raw: { sub: "subject-2" },
      },
    });

    expect(createUser).not.toHaveBeenCalled();
    expect(createIdentity).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        provider: "https://issuer.example.com",
        providerAccountId: "subject-2",
        metadata: { sub: "subject-2" },
      },
    });
    expect(user.id).toBe("user-2");
  });

  it("creates a new user when no verified email match exists", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "user-3",
      email: "new@example.com",
      name: "New User",
      image: null,
    });
    const createIdentity = vi.fn().mockResolvedValue(undefined);
    const db = {
      $transaction: async (callback: (tx: any) => Promise<unknown>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: createIdentity,
          },
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: createUser,
          },
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: {
        secret: "a".repeat(32),
        issuer: "https://issuer.example.com",
        clientId: "bookhouse",
        clientSecret: "secret",
        appUrl: "http://localhost:3000",
        scopes: ["openid"],
      },
      claims: {
        sub: "subject-3",
        email: "new@example.com",
        emailVerified: false,
        name: null,
        preferredUsername: "new-user",
        image: null,
        raw: { sub: "subject-3" },
      },
    });

    expect(createUser).toHaveBeenCalledWith({
      data: {
        email: "new@example.com",
        name: "new-user",
        image: null,
      },
    });
    expect(user.id).toBe("user-3");
  });

  it("resolves an authenticated user from the session", async () => {
    const user = await resolveAuthenticatedUser({
      db: {
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: "user-1",
            email: "reader@example.com",
            name: "Reader",
            image: null,
            identities: [
              {
                provider: "https://issuer.example.com",
                providerAccountId: "subject-1",
              },
            ],
          }),
        },
      } as never,
      session: {
        userId: "user-1",
        issuer: "https://issuer.example.com",
        subject: "subject-1",
      },
    });

    expect(user).toEqual({
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      image: null,
      issuer: "https://issuer.example.com",
      subject: "subject-1",
    });
  });

  it("returns null when the session is incomplete or stale", async () => {
    await expect(
      resolveAuthenticatedUser({
        db: {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        } as never,
        session: {},
      }),
    ).resolves.toBeNull();

    await expect(
      resolveAuthenticatedUser({
        db: {
          user: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        } as never,
        session: {
          userId: "user-1",
          issuer: "https://issuer.example.com",
          subject: "subject-1",
        },
      }),
    ).resolves.toBeNull();

    await expect(
      resolveAuthenticatedUser({
        db: {
          user: {
            findUnique: vi.fn().mockResolvedValue({
              id: "user-1",
              email: "reader@example.com",
              name: "Reader",
              image: null,
              identities: [],
            }),
          },
        } as never,
        session: {
          userId: "user-1",
          issuer: "https://issuer.example.com",
          subject: "subject-1",
        },
      }),
    ).resolves.toBeNull();
  });
});
