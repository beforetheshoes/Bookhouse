import { describe, expect, it, vi } from "vitest";
import { AuthAccessDeniedError } from "./errors";
import type { AuthenticatedUser } from "./types";
import { resolveAuthenticatedUser, upsertOidcUser } from "./users";

interface MockTransactionClient {
  userIdentity: {
    findUnique: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
  };
  user: {
    update?: ReturnType<typeof vi.fn>;
    findUnique?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
    count?: ReturnType<typeof vi.fn>;
  };
  userRole: {
    findMany?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
  };
  allowedEmail: {
    findUnique?: ReturnType<typeof vi.fn>;
  };
}

const baseConfig = {
  secret: "a".repeat(32),
  issuer: "https://issuer.example.com",
  clientId: "bookhouse",
  clientSecret: "secret",
  appUrl: "http://localhost:3000",
  scopes: ["openid"],
};

describe("user linking", () => {
  it("updates an existing identity-linked user and returns roles", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "updated@example.com",
      name: "Updated Name",
      image: "https://avatar.example.com/pic.png",
    });
    const updateIdentity = vi.fn().mockResolvedValue(undefined);
    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
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
          userRole: {
            findMany: vi
              .fn()
              .mockResolvedValue([{ role: "OWNER" }]),
          },
          allowedEmail: {},
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: baseConfig,
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
      roles: ["OWNER"],
    });
  });

  it("preserves existing profile fields when fresh claims omit them", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "reader@example.com",
      name: "Reader",
      image: "https://avatar.example.com/original.png",
    });
    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue({
              id: "identity-1",
              userId: "user-1",
              user: {
                id: "user-1",
                email: "reader@example.com",
                name: "Reader",
                image: "https://avatar.example.com/original.png",
              },
            }),
            update: vi.fn().mockResolvedValue(undefined),
          },
          user: {
            update: updateUser,
          },
          userRole: {
            findMany: vi.fn().mockResolvedValue([]),
          },
          allowedEmail: {},
        }),
    };

    await upsertOidcUser({
      db: db as never,
      config: baseConfig,
      claims: {
        sub: "subject-1",
        email: null,
        emailVerified: false,
        name: null,
        preferredUsername: null,
        image: null,
        raw: { sub: "subject-1" },
      },
    });

    expect(updateUser).toHaveBeenCalledWith({
      where: {
        id: "user-1",
      },
      data: {
        email: "reader@example.com",
        name: "Reader",
        image: "https://avatar.example.com/original.png",
      },
    });
  });

  it("makes the first user the OWNER without checking the allowlist", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
      name: "Owner",
      image: null,
    });
    const createIdentity = vi.fn().mockResolvedValue(undefined);
    const createRole = vi.fn().mockResolvedValue(undefined);
    const allowedFindUnique = vi.fn();

    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: createIdentity,
          },
          user: {
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(null),
            create: createUser,
          },
          userRole: {
            create: createRole,
          },
          allowedEmail: {
            findUnique: allowedFindUnique,
          },
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: baseConfig,
      claims: {
        sub: "subject-owner",
        email: "owner@example.com",
        emailVerified: true,
        name: "Owner",
        preferredUsername: null,
        image: null,
        raw: { sub: "subject-owner" },
      },
    });

    expect(allowedFindUnique).not.toHaveBeenCalled();
    expect(createRole).toHaveBeenCalledWith({
      data: { userId: "user-1", role: "OWNER" },
    });
    expect(user.roles).toEqual(["OWNER"]);
  });

  it("rejects a new user whose email is not on the allowlist", async () => {
    const createUser = vi.fn();
    const createRole = vi.fn();
    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
          },
          user: {
            count: vi.fn().mockResolvedValue(1),
            findUnique: vi.fn().mockResolvedValue(null),
            create: createUser,
          },
          userRole: { create: createRole },
          allowedEmail: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        }),
    };

    await expect(
      upsertOidcUser({
        db: db as never,
        config: baseConfig,
        claims: {
          sub: "subject-viewer",
          email: "viewer@example.com",
          emailVerified: true,
          name: "Viewer",
          preferredUsername: null,
          image: null,
          raw: { sub: "subject-viewer" },
        },
      }),
    ).rejects.toBeInstanceOf(AuthAccessDeniedError);

    expect(createUser).not.toHaveBeenCalled();
    expect(createRole).not.toHaveBeenCalled();
  });

  it("creates an allow-listed new user as a VIEWER (case-insensitive email)", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "user-2",
      email: "Viewer@Example.com",
      name: "Viewer",
      image: null,
    });
    const createRole = vi.fn().mockResolvedValue(undefined);
    const allowedFindUnique = vi
      .fn()
      .mockResolvedValue({ id: "allowed-1" });

    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(undefined),
          },
          user: {
            count: vi.fn().mockResolvedValue(1),
            findUnique: vi.fn().mockResolvedValue(null),
            create: createUser,
          },
          userRole: { create: createRole },
          allowedEmail: { findUnique: allowedFindUnique },
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: baseConfig,
      claims: {
        sub: "subject-viewer",
        email: "Viewer@Example.com",
        emailVerified: true,
        name: "Viewer",
        preferredUsername: null,
        image: null,
        raw: { sub: "subject-viewer" },
      },
    });

    expect(allowedFindUnique).toHaveBeenCalledWith({
      where: { email: "viewer@example.com" },
      select: { id: true },
    });
    expect(createRole).toHaveBeenCalledWith({
      data: { userId: "user-2", role: "VIEWER" },
    });
    expect(user.roles).toEqual(["VIEWER"]);
  });

  it("rejects when claims have no email and the user is not first", async () => {
    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
          },
          user: {
            count: vi.fn().mockResolvedValue(1),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn(),
          },
          userRole: { create: vi.fn() },
          allowedEmail: { findUnique: vi.fn() },
        }),
    };

    await expect(
      upsertOidcUser({
        db: db as never,
        config: baseConfig,
        claims: {
          sub: "subject-noemail",
          email: null,
          emailVerified: false,
          name: null,
          preferredUsername: null,
          image: null,
          raw: { sub: "subject-noemail" },
        },
      }),
    ).rejects.toBeInstanceOf(AuthAccessDeniedError);
  });

  it("links by verified email to an existing user and preserves their roles", async () => {
    const createIdentity = vi.fn().mockResolvedValue(undefined);
    const createUser = vi.fn();
    const createRole = vi.fn();
    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: createIdentity,
          },
          user: {
            count: vi.fn().mockResolvedValue(1),
            findUnique: vi.fn().mockResolvedValue({
              id: "user-2",
              email: "reader@example.com",
              name: "Reader",
              image: null,
            }),
            create: createUser,
          },
          userRole: {
            findMany: vi.fn().mockResolvedValue([{ role: "VIEWER" }]),
            create: createRole,
          },
          allowedEmail: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        }),
    };

    const user = await upsertOidcUser({
      db: db as never,
      config: baseConfig,
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
    expect(createRole).not.toHaveBeenCalled();
    expect(createIdentity).toHaveBeenCalledWith({
      data: {
        userId: "user-2",
        provider: "https://issuer.example.com",
        providerAccountId: "subject-2",
        metadata: { sub: "subject-2" },
      },
    });
    expect(user.id).toBe("user-2");
    expect(user.roles).toEqual(["VIEWER"]);
  });

  it("falls back to the email address when a new owner has no display name claims", async () => {
    const createUser = vi.fn().mockResolvedValue({
      id: "user-4",
      email: "email-only@example.com",
      name: "email-only@example.com",
      image: null,
    });
    const db = {
      $transaction: async (callback: (tx: MockTransactionClient) => Promise<AuthenticatedUser>) =>
        callback({
          userIdentity: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(undefined),
          },
          user: {
            count: vi.fn().mockResolvedValue(0),
            findUnique: vi.fn().mockResolvedValue(null),
            create: createUser,
          },
          userRole: { create: vi.fn().mockResolvedValue(undefined) },
          allowedEmail: { findUnique: vi.fn() },
        }),
    };

    await upsertOidcUser({
      db: db as never,
      config: baseConfig,
      claims: {
        sub: "subject-4",
        email: "email-only@example.com",
        emailVerified: false,
        name: null,
        preferredUsername: null,
        image: null,
        raw: { sub: "subject-4" },
      },
    });

    expect(createUser).toHaveBeenCalledWith({
      data: {
        email: "email-only@example.com",
        name: "email-only@example.com",
        image: null,
      },
    });
  });

  it("resolves an authenticated user with their roles from the session", async () => {
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
            roles: [{ role: "OWNER" }],
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
      roles: ["OWNER"],
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
              roles: [],
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
