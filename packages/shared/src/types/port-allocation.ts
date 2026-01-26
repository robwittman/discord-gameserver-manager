/**
 * Configuration for a port pool
 */
export interface PortPool {
  start: number;
  end: number;
  description: string;
}

/**
 * Map of pool names to their configurations
 */
export type PortPools = Record<string, PortPool>;

/**
 * Host address configuration
 */
export interface HostConfig {
  internal: string;
  external: string;
}

/**
 * Complete port configuration loaded from YAML
 */
export interface PortConfig {
  pools: PortPools;
  host: HostConfig;
}

/**
 * A port allocation record in the database
 */
export interface PortAllocation {
  id: number;
  serverId: string;
  pool: string;
  port: number;
  purpose: string;
}

/**
 * Input for creating a port allocation
 */
export interface CreatePortAllocationInput {
  serverId: string;
  pool: string;
  port: number;
  purpose: string;
}
