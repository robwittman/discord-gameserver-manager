import { getDatabase } from "../schema.js";
import type { SftpAccess } from "@discord-server-manager/shared";

interface SftpAccessRow {
  id: number;
  server_id: string;
  user_id: string;
  username: string;
  created_at: string;
}

function rowToSftpAccess(row: SftpAccessRow): SftpAccess {
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    username: row.username,
    createdAt: row.created_at,
  };
}

/**
 * Create an SFTP access grant
 */
export function createSftpAccess(
  serverId: string,
  userId: string,
  username: string
): SftpAccess {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO sftp_access (server_id, user_id, username, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(serverId, userId, username, now);

  return {
    id: Number(result.lastInsertRowid),
    serverId,
    userId,
    username,
    createdAt: now,
  };
}

/**
 * Get all SFTP access grants for a server
 */
export function getSftpAccessByServer(serverId: string): SftpAccess[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM sftp_access WHERE server_id = ?");
  const rows = stmt.all(serverId) as SftpAccessRow[];
  return rows.map(rowToSftpAccess);
}

/**
 * Get SFTP access for a specific user and server
 */
export function getSftpAccessForUser(serverId: string, userId: string): SftpAccess | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM sftp_access WHERE server_id = ? AND user_id = ?");
  const row = stmt.get(serverId, userId) as SftpAccessRow | undefined;
  return row ? rowToSftpAccess(row) : null;
}

/**
 * Get all SFTP access grants for a user
 */
export function getSftpAccessByUser(userId: string): SftpAccess[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM sftp_access WHERE user_id = ?");
  const rows = stmt.all(userId) as SftpAccessRow[];
  return rows.map(rowToSftpAccess);
}

/**
 * Delete an SFTP access grant
 */
export function deleteSftpAccess(serverId: string, userId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM sftp_access WHERE server_id = ? AND user_id = ?");
  const result = stmt.run(serverId, userId);
  return result.changes > 0;
}

/**
 * Delete all SFTP access grants for a server
 */
export function deleteSftpAccessByServer(serverId: string): number {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM sftp_access WHERE server_id = ?");
  const result = stmt.run(serverId);
  return result.changes;
}
