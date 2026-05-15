import type { Prisma, PrismaClient } from "@bookhouse/db";
import { AuthAccessDeniedError } from "./errors";
import { OWNER_ROLE, VIEWER_ROLE } from "./roles";
import type {
  AuthenticatedUser,
  AuthConfig,
  AuthSessionData,
  NormalizedOidcClaims,
} from "./types";

type DatabaseClient = Pick<
  PrismaClient,
  "$transaction" | "user" | "userRole" | "allowedEmail"
>;

function toAuthenticatedUser(input: {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  issuer: string;
  subject: string;
  roles: string[];
}): AuthenticatedUser {
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    image: input.image,
    issuer: input.issuer,
    subject: input.subject,
    roles: input.roles,
  };
}

function normalizeEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }
  return email.trim().toLowerCase();
}

export async function upsertOidcUser(input: {
  db: DatabaseClient;
  config: AuthConfig;
  claims: NormalizedOidcClaims;
}): Promise<AuthenticatedUser> {
  const { db, config, claims } = input;

  // Normalize the email up front so storage, allowlist lookups, and
  // email-based account linking are all case-insensitive.
  const normalizedEmail = normalizeEmail(claims.email);
  const normalizedClaims: NormalizedOidcClaims = {
    ...claims,
    email: normalizedEmail,
  };

  // Serializable isolation prevents the first-user race: two concurrent
  // OIDC callbacks would otherwise each see User count = 0 and both
  // promote themselves to OWNER. Serializable forces one to abort.
  return db.$transaction(
    async (tx) => {
    const existingIdentity = await tx.userIdentity.findUnique({
      where: {
        provider_providerAccountId: {
          provider: config.issuer,
          providerAccountId: claims.sub,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingIdentity) {
      const updatedUser = await tx.user.update({
        where: {
          id: existingIdentity.userId,
        },
        data: {
          email: normalizedClaims.email ?? existingIdentity.user.email,
          name: normalizedClaims.name ?? existingIdentity.user.name,
          image: normalizedClaims.image ?? existingIdentity.user.image,
        },
      });

      await tx.userIdentity.update({
        where: {
          id: existingIdentity.id,
        },
        data: {
          metadata: normalizedClaims.raw as Prisma.InputJsonValue,
        },
      });

      const roleRows = await tx.userRole.findMany({
        where: { userId: updatedUser.id },
        select: { role: true },
      });

      return toAuthenticatedUser({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        image: updatedUser.image,
        issuer: config.issuer,
        subject: normalizedClaims.sub,
        roles: roleRows.map((row) => row.role),
      });
    }

    const userCount = await tx.user.count();
    const isFirstUser = userCount === 0;

    if (!isFirstUser) {
      const allowed = normalizedEmail
        ? await tx.allowedEmail.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          })
        : null;

      const linkableExistingUser =
        normalizedEmail && normalizedClaims.emailVerified
          ? await tx.user.findUnique({
              where: { email: normalizedEmail },
              select: { id: true },
            })
          : null;

      if (!allowed && !linkableExistingUser) {
        throw new AuthAccessDeniedError(
          "This email is not authorized to access this library.",
        );
      }
    }

    const existingUser =
      normalizedEmail && normalizedClaims.emailVerified
        ? await tx.user.findUnique({
            where: {
              email: normalizedEmail,
            },
          })
        : null;

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: normalizedEmail,
          name:
            normalizedClaims.name ??
            normalizedClaims.preferredUsername ??
            normalizedEmail,
          image: normalizedClaims.image,
        },
      }));

    await tx.userIdentity.create({
      data: {
        userId: user.id,
        provider: config.issuer,
        providerAccountId: normalizedClaims.sub,
        metadata: normalizedClaims.raw as Prisma.InputJsonValue,
      },
    });

    let assignedRoles: string[];
    if (existingUser) {
      const roleRows = await tx.userRole.findMany({
        where: { userId: user.id },
        select: { role: true },
      });
      assignedRoles = roleRows.map((row) => row.role);
    } else {
      const role = isFirstUser ? OWNER_ROLE : VIEWER_ROLE;
      await tx.userRole.create({
        data: {
          userId: user.id,
          role,
        },
      });
      assignedRoles = [role];
    }

    return toAuthenticatedUser({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      issuer: config.issuer,
      subject: normalizedClaims.sub,
      roles: assignedRoles,
    });
  },
    { isolationLevel: "Serializable" },
  );
}

export async function resolveAuthenticatedUser(input: {
  db: Pick<PrismaClient, "user">;
  session: AuthSessionData;
}): Promise<AuthenticatedUser | null> {
  const { db, session } = input;

  if (!session.userId || !session.issuer || !session.subject) {
    return null;
  }

  const user = await db.user.findUnique({
    where: {
      id: session.userId,
    },
    include: {
      identities: true,
      roles: { select: { role: true } },
    },
  });

  if (!user) {
    return null;
  }

  const matchingIdentity = user.identities.find(
    (identity) =>
      identity.provider === session.issuer &&
      identity.providerAccountId === session.subject,
  );

  if (!matchingIdentity) {
    return null;
  }

  return toAuthenticatedUser({
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    issuer: session.issuer,
    subject: session.subject,
    roles: user.roles.map((row) => row.role),
  });
}
