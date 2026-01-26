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
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

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
}): Promise<ApiResponse<{ server: ServerInfo; portAllocationFailed: boolean }>> {
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

export async function deleteServer(id: string): Promise<ApiResponse<null>> {
  return request("DELETE", `/servers/${id}`);
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
