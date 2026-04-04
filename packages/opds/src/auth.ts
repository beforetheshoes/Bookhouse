import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const KEY_LENGTH = 64;
const SALT_LENGTH = 32;

const scrypt = promisify(scryptCb);

/** Hash a password using scrypt. Returns "salt:hash" in hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

/** Verify a password against a stored "salt:hash" string. Timing-safe. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const colonIndex = stored.indexOf(":");
  if (colonIndex === -1) return false;

  const saltHex = stored.slice(0, colonIndex);
  const hashHex = stored.slice(colonIndex + 1);

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(hashHex, "hex");

  if (salt.length !== SALT_LENGTH || storedKey.length !== KEY_LENGTH) {
    return false;
  }

  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return timingSafeEqual(derivedKey, storedKey);
}
