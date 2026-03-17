import path from "node:path";
import { defineConfig, env } from "prisma/config";

export const prismaSchemaPath = path.join(__dirname, "prisma", "schema.prisma");
export const prismaDatasourceUrl = env("DATABASE_URL");

export default defineConfig({
  schema: prismaSchemaPath,
  datasource: {
    url: prismaDatasourceUrl,
  },
});
