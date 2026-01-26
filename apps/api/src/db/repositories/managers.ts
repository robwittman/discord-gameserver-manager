import { getDatabase } from "../schema.js";
import type { ServerManager } from "@discord-server-manager/shared";

interface ManagerRow {
  id: number;
  server_id: string;
  user_id: string;
  granted_by: string;
  created_at: string;
}

function rowToManager(row: ManagerRow): ServerManager {
  return {
    id: row.id,
    serverId: row.server_id,
    userId: row.user_id,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  };
}

/**
 * Add a manager to a server
 */
export function addManager(
  serverId: string,
  userId: string,
  grantedBy: string
): ServerManager {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO server_managers (server_id, user_id, granted_by, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(serverId, userId, grantedBy, now);

  return {
    id: Number(result.lastInsertRowid),
    serverId,
    userId,
    grantedBy,
    createdAt: now,
  };
}

/**
 * Remove a manager from a server
 */
export function removeManager(serverId: string, userId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM server_managers WHERE server_id = ? AND user_id = ?");
  const result = stmt.run(serverId, userId);
  return result.changes > 0;
}

/**
 * Get all managers for a server
 */
export function getManagersByServer(serverId: string): ServerManager[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM server_managers WHERE server_id = ?");
  const rows = stmt.all(serverId) as ManagerRow[];
  return rows.map(rowToManager);
}

/**
 * Check if a user is a manager of a server
 */
export function isManager(serverId: string, userId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("SELECT 1 FROM server_managers WHERE server_id = ? AND user_id = ?");
  const row = stmt.get(serverId, userId);
  return row !== undefined;
}

/**
 * Get all servers a user manages (not owns)
 */
export function getServersManagedByUser(userId: string): string[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT server_id FROM server_managers WHERE user_id = ?");
  const rows = stmt.all(userId) as Array<{ server_id: string }>;
  return rows.map((r) => r.server_id);
}

/**
 * Check if a user can manage a server (is owner or manager)
 */
export function canManageServer(serverId: string, userId: string, ownerId: string): boolean {
  if (userId === ownerId) {
    return true;
  }
  return isManager(serverId, userId);
}
