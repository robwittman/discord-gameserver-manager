import { getDatabase } from "../schema.js";
import type { PortAllocation, CreatePortAllocationInput } from "@discord-server-manager/shared";

interface PortAllocationRow {
  id: number;
  server_id: string;
  pool: string;
  port: number;
  purpose: string;
}

function rowToPortAllocation(row: PortAllocationRow): PortAllocation {
  return {
    id: row.id,
    serverId: row.server_id,
    pool: row.pool,
    port: row.port,
    purpose: row.purpose,
  };
}

/**
 * Create a port allocation
 */
export function createPortAllocation(input: CreatePortAllocationInput): PortAllocation {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO port_allocations (server_id, pool, port, purpose)
    VALUES (?, ?, ?, ?)
  `);

  const result = stmt.run(input.serverId, input.pool, input.port, input.purpose);

  return {
    id: Number(result.lastInsertRowid),
    serverId: input.serverId,
    pool: input.pool,
    port: input.port,
    purpose: input.purpose,
  };
}

/**
 * Create multiple port allocations in a transaction
 */
export function createPortAllocations(inputs: CreatePortAllocationInput[]): PortAllocation[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO port_allocations (server_id, pool, port, purpose)
    VALUES (?, ?, ?, ?)
  `);

  const allocations: PortAllocation[] = [];

  const transaction = db.transaction(() => {
    for (const input of inputs) {
      const result = stmt.run(input.serverId, input.pool, input.port, input.purpose);
      allocations.push({
        id: Number(result.lastInsertRowid),
        serverId: input.serverId,
        pool: input.pool,
        port: input.port,
        purpose: input.purpose,
      });
    }
  });

  transaction();
  return allocations;
}

/**
 * Get all port allocations for a server
 */
export function getPortAllocationsByServer(serverId: string): PortAllocation[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM port_allocations WHERE server_id = ?");
  const rows = stmt.all(serverId) as PortAllocationRow[];
  return rows.map(rowToPortAllocation);
}

/**
 * Get all port allocations for a pool
 */
export function getPortAllocationsByPool(pool: string): PortAllocation[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM port_allocations WHERE pool = ? ORDER BY port");
  const rows = stmt.all(pool) as PortAllocationRow[];
  return rows.map(rowToPortAllocation);
}

/**
 * Get all allocated ports in a pool
 */
export function getAllocatedPortsInPool(pool: string): number[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT port FROM port_allocations WHERE pool = ? ORDER BY port");
  const rows = stmt.all(pool) as Array<{ port: number }>;
  return rows.map((r) => r.port);
}

/**
 * Check if a port is allocated
 */
export function isPortAllocated(pool: string, port: number): boolean {
  const db = getDatabase();
  const stmt = db.prepare("SELECT 1 FROM port_allocations WHERE pool = ? AND port = ?");
  const row = stmt.get(pool, port);
  return row !== undefined;
}

/**
 * Delete all port allocations for a server
 */
export function deletePortAllocationsByServer(serverId: string): number {
  const db = getDatabase();
  const stmt = db.prepare("DELETE FROM port_allocations WHERE server_id = ?");
  const result = stmt.run(serverId);
  return result.changes;
}

/**
 * Get total allocated ports count by pool
 */
export function countAllocatedPortsByPool(): Record<string, number> {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT pool, COUNT(*) as count
    FROM port_allocations
    GROUP BY pool
  `);
  const rows = stmt.all() as Array<{ pool: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.pool] = row.count;
  }
  return result;
}
