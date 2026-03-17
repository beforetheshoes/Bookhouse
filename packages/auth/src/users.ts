import type { Prisma, PrismaClient } from "@bookhouse/db";
import type {
  AuthenticatedUser,
  AuthConfig,
  AuthSessionData,
  NormalizedOidcClaims,
} from "./types";

type DatabaseClient = Pick<PrismaClient, "$transaction" | "user">;

function toAuthenticatedUser(input: {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  issuer: string;
  subject: string;
}): AuthenticatedUser {
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    image: input.image,
    issuer: input.issuer,
    subject: input.subject,
  };
}

export async function upsertOidcUser(input: {
  db: DatabaseClient;
  config: AuthConfig;
  claims: NormalizedOidcClaims;
}): Promise<AuthenticatedUser> {
  const { db, config, claims } = input;

  return db.$transaction(async (tx) => {
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
          email: claims.email ?? existingIdentity.user.email,
          name: claims.name ?? existingIdentity.user.name,
          image: claims.image ?? existingIdentity.user.image,
        },
      });

      await tx.userIdentity.update({
        where: {
          id: existingIdentity.id,
        },
        data: {
          metadata: claims.raw as Prisma.InputJsonValue,
        },
      });

      return toAuthenticatedUser({
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        image: updatedUser.image,
        issuer: config.issuer,
        subject: claims.sub,
      });
    }

    const existingUser =
      claims.email && claims.emailVerified
        ? await tx.user.findUnique({
            where: {
              email: claims.email,
            },
          })
        : null;

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          email: claims.email,
          name: claims.name ?? claims.preferredUsername ?? claims.email,
          image: claims.image,
        },
      }));

    await tx.userIdentity.create({
      data: {
        userId: user.id,
        provider: config.issuer,
        providerAccountId: claims.sub,
        metadata: claims.raw as Prisma.InputJsonValue,
      },
    });

    return toAuthenticatedUser({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      issuer: config.issuer,
      subject: claims.sub,
    });
  });
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
  });
}
