/**
 * API client for communicating with the game server management API
 */

const API_BASE_URL = process.env.API_URL ?? "http://localhost:3000";

interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: unknown;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const url = `${API_BASE_URL}${path}`;

  try {
    const headers: Record<string, string> = {};
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return { data: null as T };
    }

    const data = await response.json() as T & { error?: string; details?: unknown };

    if (!response.ok) {
      return {
        error: (data as { error?: string }).error ?? `HTTP ${response.status}`,
        details: (data as { details?: unknown }).details,
      };
    }

    return { data: data as T };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Types for API responses
export interface GameInfo {
  id: string;
  name: string;
  steamAppId?: number;
}

export interface ServerInfo {
  id: string;
  gameId: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  allocatedPorts: Record<string, number>;
  ownerId: string;
  guildId: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobInfo {
  id: string;
  serverId: string;
  action: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs?: string[];
}

export interface ManagerInfo {
  id: number;
  serverId: string;
  userId: string;
  grantedBy: string;
  createdAt: string;
}

export interface ConnectionInfo {
  title: string;
  lines: string[];
}

// API Methods

export async function listGames(): Promise<ApiResponse<{ games: GameInfo[] }>> {
  return request("GET", "/games");
}

export async function getGame(id: string): Promise<ApiResponse<{ game: GameInfo }>> {
  return request("GET", `/games/${id}`);
}

export async function createServer(input: {
  gameId: string;
  name: string;
  config: Record<string, unknown>;
  ownerId: string;
  guildId: string;
  notifyChannelId?: string;
  notifyUserId?: string;
}): Promise<ApiResponse<{ server: ServerInfo; job: JobInfo | null; portAllocationFailed: boolean }>> {
  return request("POST", "/servers", input);
}

export async function listServers(query: {
  guildId?: string;
  ownerId?: string;
}): Promise<ApiResponse<{ servers: ServerInfo[] }>> {
  const params = new URLSearchParams();
  if (query.guildId) params.set("guildId", query.guildId);
  if (query.ownerId) params.set("ownerId", query.ownerId);
  const queryString = params.toString();
  return request("GET", `/servers${queryString ? `?${queryString}` : ""}`);
}

export async function getServer(
  id: string
): Promise<ApiResponse<{ server: ServerInfo; game: GameInfo | null }>> {
  return request("GET", `/servers/${id}`);
}

export async function getServerConnection(
  id: string
): Promise<ApiResponse<{ server: { id: string; name: string; status: string }; connection: ConnectionInfo }>> {
  return request("GET", `/servers/${id}/connection`);
}

export async function deleteServer(id: string, userId: string): Promise<ApiResponse<{ message: string; job: JobInfo }>> {
  return request("DELETE", `/servers/${id}`, { userId });
}

export async function queueJob(
  serverId: string,
  action: string
): Promise<ApiResponse<{ job: JobInfo }>> {
  return request("POST", `/servers/${serverId}/jobs`, { action });
}

export async function getJob(id: string): Promise<ApiResponse<{ job: JobInfo }>> {
  return request("GET", `/jobs/${id}`);
}

export async function getServerManagers(
  serverId: string
): Promise<ApiResponse<{ ownerId: string; managers: ManagerInfo[] }>> {
  return request("GET", `/servers/${serverId}/managers`);
}

export async function addServerManager(
  serverId: string,
  userId: string,
  grantedBy: string
): Promise<ApiResponse<{ manager: ManagerInfo }>> {
  return request("POST", `/servers/${serverId}/managers`, { userId, grantedBy });
}

export async function removeServerManager(
  serverId: string,
  userId: string
): Promise<ApiResponse<null>> {
  return request("DELETE", `/servers/${serverId}/managers/${userId}`);
}

export async function canManageServer(
  serverId: string,
  userId: string
): Promise<ApiResponse<{ canManage: boolean; isOwner: boolean; isManager: boolean }>> {
  return request("GET", `/servers/${serverId}/can-manage?userId=${userId}`);
}

// Mod types
export interface ModEntry {
  source: string;
  id: string;
  version?: string;
  enabled: boolean;
  name?: string;
}

export interface ModsConfig {
  enabled: boolean;
  source: string;
  additionalSources?: string[];
  fileFormat: string;
  installPath: string;
  framework?: {
    name: string;
    source: string;
    packageId: string;
    required: boolean;
  };
  repositoryUrl?: string;
  notes?: string;
}

// Mod API methods
export async function getServerMods(
  serverId: string
): Promise<ApiResponse<{ mods: ModEntry[]; modsConfig: ModsConfig | null }>> {
  return request("GET", `/servers/${serverId}/mods`);
}

export async function setServerMods(
  serverId: string,
  mods: ModEntry[]
): Promise<ApiResponse<{ mods: ModEntry[] }>> {
  return request("PUT", `/servers/${serverId}/mods`, { mods });
}

export async function addServerMod(
  serverId: string,
  mod: { source?: string; id: string; version?: string; enabled?: boolean; name?: string }
): Promise<ApiResponse<{ mod: ModEntry; mods: ModEntry[] }>> {
  return request("POST", `/servers/${serverId}/mods`, mod);
}

export async function removeServerMod(
  serverId: string,
  modId: string,
  source?: string
): Promise<ApiResponse<{ removed: ModEntry; mods: ModEntry[] }>> {
  const query = source ? `?source=${encodeURIComponent(source)}` : "";
  return request("DELETE", `/servers/${serverId}/mods/${encodeURIComponent(modId)}${query}`);
}

export async function toggleServerMod(
  serverId: string,
  modId: string,
  options: { source?: string; enabled?: boolean; version?: string }
): Promise<ApiResponse<{ mod: ModEntry; mods: ModEntry[] }>> {
  const query = options.source ? `?source=${encodeURIComponent(options.source)}` : "";
  return request("PATCH", `/servers/${serverId}/mods/${encodeURIComponent(modId)}${query}`, {
    enabled: options.enabled,
    version: options.version,
  });
}
