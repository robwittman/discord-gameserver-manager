import { getPortPool } from "../config/ports.js";
import { portsRepo } from "../db/index.js";
import type { GamePorts, AllocatedPorts, CreatePortAllocationInput } from "@discord-server-manager/shared";

export class PortAllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortAllocationError";
  }
}

/**
 * Find a consecutive block of available ports in a pool
 */
function findConsecutiveBlock(
  allocatedPorts: Set<number>,
  poolStart: number,
  poolEnd: number,
  blockSize: number
): number | null {
  for (let start = poolStart; start <= poolEnd - blockSize + 1; start++) {
    let found = true;
    for (let i = 0; i < blockSize; i++) {
      if (allocatedPorts.has(start + i)) {
        found = false;
        break;
      }
    }
    if (found) {
      return start;
    }
  }
  return null;
}

/**
 * Find available ports for a game without creating allocations yet.
 * Returns the ports that would be allocated.
 */
export function findAvailableGamePorts(gamePorts: GamePorts): AllocatedPorts {
  const pool = getPortPool("game");
  if (!pool) {
    throw new PortAllocationError("Game port pool not configured");
  }

  const portNames = Object.keys(gamePorts);
  if (portNames.length === 0) {
    return {};
  }

  // Get all currently allocated ports in the pool
  const allocatedList = portsRepo.getAllocatedPortsInPool("game");
  const allocatedSet = new Set(allocatedList);

  // Calculate port offsets to maintain relative positions
  const portDefs = Object.entries(gamePorts);
  const basePorts = portDefs.map(([_, def]) => def.port);
  const minBasePort = Math.min(...basePorts);
  const offsets = basePorts.map((p) => p - minBasePort);
  const blockSize = Math.max(...offsets) + 1;

  // Find a consecutive block that can accommodate all ports
  const blockStart = findConsecutiveBlock(allocatedSet, pool.start, pool.end, blockSize);

  if (blockStart === null) {
    throw new PortAllocationError(
      `No consecutive block of ${blockSize} ports available in game pool`
    );
  }

  // Build the result without creating allocations
  const result: AllocatedPorts = {};

  for (const [name, def] of portDefs) {
    const offset = def.port - minBasePort;
    const allocatedPort = blockStart + offset;
    result[name] = allocatedPort;
  }

  return result;
}

/**
 * Create port allocations for a server.
 * Call this after the server has been created.
 */
export function createPortAllocations(
  serverId: string,
  allocatedPorts: AllocatedPorts,
  pool: string = "game"
): void {
  const allocations: CreatePortAllocationInput[] = [];

  for (const [purpose, port] of Object.entries(allocatedPorts)) {
    allocations.push({
      serverId,
      pool,
      port,
      purpose,
    });
  }

  portsRepo.createPortAllocations(allocations);
}

/**
 * Find an available SFTP port without creating an allocation
 */
export function findAvailableSftpPort(): number {
  const pool = getPortPool("sftp");
  if (!pool) {
    throw new PortAllocationError("SFTP port pool not configured");
  }

  // Get all currently allocated ports in the pool
  const allocatedList = portsRepo.getAllocatedPortsInPool("sftp");
  const allocatedSet = new Set(allocatedList);

  // Find the first available port
  for (let port = pool.start; port <= pool.end; port++) {
    if (!allocatedSet.has(port)) {
      return port;
    }
  }

  throw new PortAllocationError("No SFTP ports available");
}

/**
 * Allocate an SFTP port for a server
 */
export function allocateSftpPort(serverId: string): number {
  const port = findAvailableSftpPort();

  portsRepo.createPortAllocation({
    serverId,
    pool: "sftp",
    port,
    purpose: "sftp",
  });

  return port;
}

/**
 * Release all ports allocated to a server
 */
export function releasePorts(serverId: string): void {
  portsRepo.deletePortAllocationsByServer(serverId);
}

/**
 * Get port pool utilization statistics
 */
export function getPoolStats(): Record<string, { total: number; used: number; available: number }> {
  const gamePool = getPortPool("game");
  const sftpPool = getPortPool("sftp");
  const counts = portsRepo.countAllocatedPortsByPool();

  const stats: Record<string, { total: number; used: number; available: number }> = {};

  if (gamePool) {
    const total = gamePool.end - gamePool.start + 1;
    const used = counts["game"] ?? 0;
    stats["game"] = { total, used, available: total - used };
  }

  if (sftpPool) {
    const total = sftpPool.end - sftpPool.start + 1;
    const used = counts["sftp"] ?? 0;
    stats["sftp"] = { total, used, available: total - used };
  }

  return stats;
}
