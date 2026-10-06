// Server-side password storage.
//
// Two stored formats are understood:
//   • legacy  – unsalted SHA-256 hex (64 chars), produced by src/lib/crypto.hashPassword
//   • scrypt  – "scrypt$N$r$p$<salt b64>$<key b64>", salted and deliberately slow
//
// New hashes are written as scrypt ONLY when PASSWORD_HASH=scrypt is set in .env. Other app
// deployments sharing the same database can only read legacy hashes, so the switch is turned on
// once every deployment runs this code. With the flag on, legacy hashes are upgraded on login.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { hashPassword as legacySha256 } from "../src/lib/crypto";

const SCRYPT_PREFIX = "scrypt$";
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

export const isLegacyHash = (stored: any): boolean => typeof stored === "string" && /^[0-9a-f]{64}$/i.test(stored);
export const isScryptHash = (stored: any): boolean => typeof stored === "string" && stored.startsWith(SCRYPT_PREFIX);

export const scryptEnabled = (): boolean => (process.env.PASSWORD_HASH || "").trim().toLowerCase() === "scrypt";

const safeEqual = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

// Hash a plaintext password in the format currently configured
export function hashNewPassword(plain: string): string {
  const p = String(plain ?? "").trim();
  if (!scryptEnabled()) return legacySha256(p);
  const salt = randomBytes(16);
  const key = scryptSync(p, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `${SCRYPT_PREFIX}${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

// Value to store for a password field that may already arrive hashed (older clients send SHA-256 hex)
export function toStoredPassword(value: string): string {
  if (isLegacyHash(value) || isScryptHash(value)) return value;
  return hashNewPassword(value);
}

export function verifyPassword(plain: string, stored: string): boolean {
  const p = String(plain ?? "").trim();
  if (!p || !stored) return false;
  if (isScryptHash(stored)) {
    const [, n, r, par, saltB64, keyB64] = stored.split("$");
    const expected = Buffer.from(keyB64 || "", "base64");
    const derived = scryptSync(p, Buffer.from(saltB64 || "", "base64"), expected.length || KEY_LENGTH, {
      N: Number(n), r: Number(r), p: Number(par)
    });
    return safeEqual(derived, expected);
  }
  // Legacy SHA-256 (or, for very old rows, plaintext that is hashed before comparing)
  const storedHash = isLegacyHash(stored) ? stored.toLowerCase() : legacySha256(stored);
  return safeEqual(Buffer.from(legacySha256(p)), Buffer.from(storedHash));
}

// True when a successful login should rewrite the stored hash in the stronger format
export const needsRehash = (stored: string): boolean => scryptEnabled() && !isScryptHash(stored);

// Short fingerprint of the stored hash, embedded in the JWT so a password change invalidates old tokens
export function passwordFingerprint(stored: string): string {
  return legacySha256(`fp:${stored || ""}`).slice(0, 16);
}
