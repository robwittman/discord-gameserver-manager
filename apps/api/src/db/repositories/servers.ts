import { randomUUID } from "node:crypto";
import { getDatabase } from "../schema.js";
import {
  ServerStatus,
  type ServerInstance,
  type CreateServerInput,
  type UpdateServerInput,
  type AllocatedPorts,
  type ServerConfig,
} from "@discord-server-manager/shared";

interface ServerRow {
  id: string;
  game_id: string;
  name: string;
  status: string;
  config: string;
  allocated_ports: string;
  internal_address: string | null;
  vm_id: number | null;
  vm_node: string | null;
  owner_id: string;
  guild_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function rowToServer(row: ServerRow): ServerInstance {
  return {
    id: row.id,
    gameId: row.game_id,
    name: row.name,
    status: row.status as ServerStatus,
    config: JSON.parse(row.config) as ServerConfig,
    allocatedPorts: JSON.parse(row.allocated_ports) as AllocatedPorts,
    internalAddress: row.internal_address ?? undefined,
    vmId: row.vm_id ?? undefined,
    vmNode: row.vm_node ?? undefined,
    ownerId: row.owner_id,
    guildId: row.guild_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
  };
}

/**
 * Create a new server instance
 */
export function createServer(
  input: CreateServerInput,
  allocatedPorts: AllocatedPorts,
  status: ServerStatus = ServerStatus.Pending
): ServerInstance {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO servers (id, game_id, name, status, config, allocated_ports, owner_id, guild_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.gameId,
    input.name,
    status,
    JSON.stringify(input.config),
    JSON.stringify(allocatedPorts),
    input.ownerId,
    input.guildId,
    now,
    now
  );

  return {
    id,
    gameId: input.gameId,
    name: input.name,
    status,
    config: input.config,
    allocatedPorts,
    ownerId: input.ownerId,
    guildId: input.guildId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get a server by ID
 * @param includeDeleted - If true, includes soft-deleted servers
 */
export function getServerById(id: string, includeDeleted: boolean = false): ServerInstance | null {
  const db = getDatabase();
  const query = includeDeleted
    ? "SELECT * FROM servers WHERE id = ?"
    : "SELECT * FROM servers WHERE id = ? AND deleted_at IS NULL";
  const stmt = db.prepare(query);
  const row = stmt.get(id) as ServerRow | undefined;
  return row ? rowToServer(row) : null;
}

/**
 * Get all servers for a guild
 */
export function getServersByGuild(guildId: string): ServerInstance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM servers WHERE guild_id = ? AND deleted_at IS NULL ORDER BY created_at DESC");
  const rows = stmt.all(guildId) as ServerRow[];
  return rows.map(rowToServer);
}

/**
 * Get all servers for an owner
 */
export function getServersByOwner(ownerId: string): ServerInstance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM servers WHERE owner_id = ? AND deleted_at IS NULL ORDER BY created_at DESC");
  const rows = stmt.all(ownerId) as ServerRow[];
  return rows.map(rowToServer);
}

/**
 * Get all servers
 */
export function getAllServers(): ServerInstance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM servers WHERE deleted_at IS NULL ORDER BY created_at DESC");
  const rows = stmt.all() as ServerRow[];
  return rows.map(rowToServer);
}

/**
 * Update a server
 */
export function updateServer(id: string, input: UpdateServerInput): ServerInstance | null {
  const db = getDatabase();
  const existing = getServerById(id);

  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(input.name);
  }

  if (input.status !== undefined) {
    updates.push("status = ?");
    values.push(input.status);
  }

  if (input.config !== undefined) {
    updates.push("config = ?");
    values.push(JSON.stringify(input.config));
  }

  if (input.internalAddress !== undefined) {
    updates.push("internal_address = ?");
    values.push(input.internalAddress);
  }

  if (input.vmId !== undefined) {
    updates.push("vm_id = ?");
    values.push(input.vmId);
  }

  if (input.vmNode !== undefined) {
    updates.push("vm_node = ?");
    values.push(input.vmNode);
  }

  if (updates.length === 0) {
    return existing;
  }

  const now = new Date().toISOString();
  updates.push("updated_at = ?");
  values.push(now);
  values.push(id);

  const stmt = db.prepare(`UPDATE servers SET ${updates.join(", ")} WHERE id = ?`);
  stmt.run(...values);

  return getServerById(id);
}

/**
 * Delete a server
 */
export function deleteServer(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM servers WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Get servers by status
 */
export function getServersByStatus(status: ServerStatus): ServerInstance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM servers WHERE status = ? AND deleted_at IS NULL ORDER BY created_at DESC");
  const rows = stmt.all(status) as ServerRow[];
  return rows.map(rowToServer);
}

/**
 * Count servers by game for a guild
 */
export function countServersByGame(guildId: string): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT game_id, COUNT(*) as count
    FROM servers
    WHERE guild_id = ? AND deleted_at IS NULL
    GROUP BY game_id
  `);
  const rows = stmt.all(guildId) as Array<{ game_id: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.game_id] = row.count;
  }
  return result;
}

/**
 * Update server ports and set status to pending
 */
export function updateServerPorts(id: string, allocatedPorts: AllocatedPorts): ServerInstance | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE servers
    SET allocated_ports = ?, status = ?, updated_at = ?
    WHERE id = ?
  `);

  const result = stmt.run(JSON.stringify(allocatedPorts), ServerStatus.Pending, now, id);
  if (result.changes === 0) {
    return null;
  }

  return getServerById(id);
}

/**
 * Soft delete a server by setting deleted_at timestamp
 */
export function softDeleteServer(id: string): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE servers
    SET deleted_at = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `);

  const result = stmt.run(now, now, id);
  return result.changes > 0;
}

/**
 * Get all soft-deleted servers
 */
export function getDeletedServers(): ServerInstance[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM servers WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC");
  const rows = stmt.all() as ServerRow[];
  return rows.map(rowToServer);
}
