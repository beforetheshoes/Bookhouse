import fs from "node:fs";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

export const prismaSchemaPath = path.join(__dirname, "prisma", "schema.prisma");
export const workspaceEnvPath = path.join(__dirname, "..", "..", ".env");

function loadWorkspaceEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const source = fs.readFileSync(filePath, "utf8");

  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();

    if (key.length === 0 || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadWorkspaceEnvFile(workspaceEnvPath);
export const prismaDatasourceUrl = env("DATABASE_URL");

export default defineConfig({
  schema: prismaSchemaPath,
  datasource: {
    url: prismaDatasourceUrl,
  },
});
