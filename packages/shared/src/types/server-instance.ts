/**
 * Status of a game server instance
 */
export enum ServerStatus {
  PendingPorts = "pending_ports",
  Pending = "pending",
  Provisioning = "provisioning",
  Running = "running",
  Stopped = "stopped",
  Error = "error",
}

/**
 * Mapping of port names to allocated port numbers
 */
export type AllocatedPorts = Record<string, number>;

/**
 * SFTP access grant for a user
 */
export interface SftpAccess {
  id: number;
  serverId: string;
  userId: string;
  username: string;
  createdAt: string;
}

/**
 * Resolved configuration for a server instance
 */
export type ServerConfig = Record<string, string | number | boolean>;

/**
 * A game server instance stored in the database
 */
export interface ServerInstance {
  id: string;
  gameId: string;
  name: string;
  status: ServerStatus;
  config: ServerConfig;
  allocatedPorts: AllocatedPorts;
  internalAddress?: string;
  /** Proxmox VM ID (if provisioned via Proxmox) */
  vmId?: number;
  /** Proxmox node where VM is running */
  vmNode?: string;
  ownerId: string;
  guildId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Input for creating a new server instance
 */
export interface CreateServerInput {
  gameId: string;
  name: string;
  config: ServerConfig;
  ownerId: string;
  guildId: string;
}

/**
 * Input for updating a server instance
 */
export interface UpdateServerInput {
  name?: string;
  status?: ServerStatus;
  config?: ServerConfig;
  internalAddress?: string;
  vmId?: number;
  vmNode?: string;
}

/**
 * A user who can manage a server (besides the owner)
 */
export interface ServerManager {
  id: number;
  serverId: string;
  userId: string;
  grantedBy: string;
  createdAt: string;
}
