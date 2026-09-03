import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

// The localhost default is a development convenience only. In production a
// missing DATABASE_URL must fail loudly instead of silently connecting (or
// trying to) somewhere unintended.
if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL must be set when NODE_ENV=production");
}
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
export * from "./guards";
