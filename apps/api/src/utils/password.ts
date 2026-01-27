import { randomBytes } from "node:crypto";

/**
 * Generate a random password for game servers
 * Uses a character set that avoids ambiguous characters and special chars that might cause issues
 */
export function generateServerPassword(length: number = 12): string {
  // Use alphanumeric characters, avoiding ambiguous ones (0, O, l, 1, I)
  const charset = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let password = "";

  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      password += charset[byte % charset.length];
    }
  }

  return password;
}
