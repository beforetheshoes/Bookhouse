export interface DatabaseConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export function parseDatabaseUrl(url: string): DatabaseConnectionInfo {
  const parsed = new URL(url);

  const host = parsed.hostname;

  const database = parsed.pathname.replace(/^\//, "");
  if (!database) {
    throw new Error("DATABASE_URL is missing database");
  }

  const user = decodeURIComponent(parsed.username);
  if (!user) {
    throw new Error("DATABASE_URL is missing user");
  }

  const password = decodeURIComponent(parsed.password);
  const port = parsed.port ? Number(parsed.port) : 5432;

  return { host, port, user, password, database };
}
