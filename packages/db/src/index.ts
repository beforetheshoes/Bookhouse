import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

process.env.DATABASE_URL ||= "postgresql://bookhouse:bookhouse@localhost:5432/bookhouse";
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
