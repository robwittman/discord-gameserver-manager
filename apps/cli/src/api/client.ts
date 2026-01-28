import type {
  ServerInstance,
  Job,
  GameDefinition,
  ModEntry,
  ModsConfig,
  SftpCredentials,
} from "@discord-server-manager/shared";

export interface ApiClientConfig {
  baseUrl: string;
}

export interface CreateServerInput {
  gameId: string;
  name: string;
  config?: Record<string, unknown>;
  ownerId?: string;
  guildId?: string;
}

export interface CreateServerResponse {
  server: ServerInstance;
  job?: Job;
  portAllocationFailed?: boolean;
}

export class ApiClient {
  private baseUrl: string;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(errorBody.error || `API error: ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // Games
  async listGames(): Promise<GameDefinition[]> {
    const result = await this.request<{ games: GameDefinition[] }>("GET", "/games");
    return result.games;
  }

  async getGame(gameId: string): Promise<GameDefinition | null> {
    try {
      const result = await this.request<{ game: GameDefinition }>("GET", `/games/${gameId}`);
      return result.game;
    } catch {
      return null;
    }
  }

  // Servers
  async listServers(): Promise<ServerInstance[]> {
    const result = await this.request<{ servers: ServerInstance[] }>("GET", "/servers");
    return result.servers;
  }

  async getServer(serverId: string): Promise<ServerInstance | null> {
    try {
      const result = await this.request<{ server: ServerInstance }>("GET", `/servers/${serverId}`);
      return result.server;
    } catch {
      return null;
    }
  }

  async createServer(input: CreateServerInput): Promise<CreateServerResponse> {
    return this.request<CreateServerResponse>("POST", "/servers", input);
  }

  async deleteServer(serverId: string, userId: string): Promise<{ message: string; job: Job }> {
    return this.request("DELETE", `/servers/${serverId}`, { userId });
  }

  async updateServer(
    serverId: string,
    updates: { name?: string; status?: string; config?: Record<string, unknown> }
  ): Promise<ServerInstance> {
    const result = await this.request<{ server: ServerInstance }>("PATCH", `/servers/${serverId}`, updates);
    return result.server;
  }

  // Jobs
  async listJobs(serverId?: string): Promise<Job[]> {
    const path = serverId ? `/servers/${serverId}/jobs` : "/jobs";
    const result = await this.request<{ jobs: Job[] }>("GET", path);
    return result.jobs;
  }

  async getJob(jobId: string): Promise<Job | null> {
    try {
      const result = await this.request<{ job: Job }>("GET", `/jobs/${jobId}`);
      return result.job;
    } catch {
      return null;
    }
  }

  async createJob(serverId: string, action: string): Promise<Job> {
    const result = await this.request<{ job: Job }>("POST", `/servers/${serverId}/jobs`, { action });
    return result.job;
  }

  // Mods
  async getServerMods(serverId: string): Promise<{ mods: ModEntry[]; modsConfig: ModsConfig | null }> {
    return this.request<{ mods: ModEntry[]; modsConfig: ModsConfig | null }>("GET", `/servers/${serverId}/mods`);
  }

  async setServerMods(serverId: string, mods: ModEntry[]): Promise<{ mods: ModEntry[] }> {
    return this.request<{ mods: ModEntry[] }>("PUT", `/servers/${serverId}/mods`, { mods });
  }

  async addServerMod(
    serverId: string,
    mod: { source?: string; id: string; version?: string; enabled?: boolean; name?: string }
  ): Promise<{ mod: ModEntry; mods: ModEntry[] }> {
    return this.request<{ mod: ModEntry; mods: ModEntry[] }>("POST", `/servers/${serverId}/mods`, mod);
  }

  async removeServerMod(serverId: string, modId: string, source?: string): Promise<{ removed: ModEntry; mods: ModEntry[] }> {
    const query = source ? `?source=${encodeURIComponent(source)}` : "";
    return this.request<{ removed: ModEntry; mods: ModEntry[] }>("DELETE", `/servers/${serverId}/mods/${encodeURIComponent(modId)}${query}`);
  }

  async toggleServerMod(
    serverId: string,
    modId: string,
    options?: { source?: string; enabled?: boolean; version?: string }
  ): Promise<{ mod: ModEntry; mods: ModEntry[] }> {
    const query = options?.source ? `?source=${encodeURIComponent(options.source)}` : "";
    return this.request<{ mod: ModEntry; mods: ModEntry[] }>(
      "PATCH",
      `/servers/${serverId}/mods/${encodeURIComponent(modId)}${query}`,
      { enabled: options?.enabled, version: options?.version }
    );
  }

  // Health
  async health(): Promise<{ status: string }> {
    return this.request<{ status: string }>("GET", "/health");
  }

  // Stats
  async stats(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/stats");
  }

  // SFTP
  async enableSftp(serverId: string, userId?: string): Promise<{ credentials: SftpCredentials; job: Job }> {
    return this.request<{ credentials: SftpCredentials; job: Job }>("POST", `/servers/${serverId}/sftp`, { userId });
  }

  async getSftpInfo(serverId: string): Promise<{
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    path: string;
    createdAt: string;
  } | null> {
    try {
      return await this.request<{
        enabled: boolean;
        host: string;
        port: number;
        username: string;
        path: string;
        createdAt: string;
      }>("GET", `/servers/${serverId}/sftp`);
    } catch {
      return null;
    }
  }

  async disableSftp(serverId: string): Promise<{ message: string; job: Job }> {
    return this.request<{ message: string; job: Job }>("DELETE", `/servers/${serverId}/sftp`);
  }

  async resetSftpPassword(serverId: string): Promise<{ credentials: SftpCredentials; job: Job }> {
    return this.request<{ credentials: SftpCredentials; job: Job }>("POST", `/servers/${serverId}/sftp/reset-password`);
  }
}

let client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!client) {
    const baseUrl = process.env.API_URL || "http://localhost:3000";
    client = new ApiClient({ baseUrl });
  }
  return client;
}
