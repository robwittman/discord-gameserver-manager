import type {
  ServerInstance,
  Job,
  GameDefinition,
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
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
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

  async deleteServer(serverId: string): Promise<void> {
    await this.request("DELETE", `/servers/${serverId}`);
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

  // Health
  async health(): Promise<{ status: string }> {
    return this.request<{ status: string }>("GET", "/health");
  }

  // Stats
  async stats(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/stats");
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
