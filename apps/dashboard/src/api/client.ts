// Type definitions matching the shared package
export enum ServerStatus {
  PendingPorts = "pending_ports",
  Pending = "pending",
  Provisioning = "provisioning",
  Running = "running",
  Stopped = "stopped",
  Error = "error",
  Deleting = "deleting",
}

export enum JobStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

export type JobAction =
  | "provision"
  | "start"
  | "stop"
  | "backup"
  | "update"
  | "deprovision"
  | "delete"
  | "install-mods"
  | "setup-sftp"
  | "disable-sftp"
  | "reset-sftp-password";

export interface ServerInstance {
  id: string;
  gameId: string;
  name: string;
  status: ServerStatus;
  config: Record<string, string | number | boolean>;
  allocatedPorts: Record<string, number>;
  internalAddress?: string;
  vmId?: number;
  vmNode?: string;
  ownerId: string;
  guildId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  mods?: Array<{
    source: string;
    id: string;
    version?: string;
    enabled: boolean;
    name?: string;
  }>;
}

export interface Job {
  id: string;
  serverId: string;
  action: JobAction;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs?: string[];
  notifyChannelId?: string;
  notifyUserId?: string;
}

export interface ServerMetrics {
  cpu: { usage: number; cores: number };
  memory: { used: number; total: number; percent: number };
  disk: { used: number; total: number; percent: number; path: string };
  uptime: number;
  timestamp: string;
}

export interface GameDefinition {
  id: string;
  name: string;
  steamAppId?: number;
}

export interface SystemStats {
  games: number;
  ports: {
    total: number;
    available: number;
    allocated: number;
  };
  jobRunner: {
    isRunning: boolean;
    activeJobs: number;
  };
}

// Get API URL from config.json or default
let cachedApiUrl: string | null = null;

async function getApiUrl(): Promise<string> {
  if (cachedApiUrl) return cachedApiUrl;

  try {
    const response = await fetch("/config.json");
    if (response.ok) {
      const config = await response.json();
      cachedApiUrl = config.apiUrl || "http://localhost:3000";
    } else {
      cachedApiUrl = "http://localhost:3000";
    }
  } catch {
    cachedApiUrl = "http://localhost:3000";
  }

  return cachedApiUrl ?? "http://localhost:3000";
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const baseUrl = await getApiUrl();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

// API methods
export const api = {
  // Servers
  async listServers(): Promise<{ servers: ServerInstance[] }> {
    return request("GET", "/servers");
  },

  async getServer(id: string): Promise<{ server: ServerInstance }> {
    return request("GET", `/servers/${id}`);
  },

  async getServerMetrics(id: string): Promise<{ metrics: ServerMetrics }> {
    return request("GET", `/servers/${id}/metrics`);
  },

  // Jobs
  async listJobs(serverId?: string): Promise<{ jobs: Job[] }> {
    const query = serverId ? `?serverId=${serverId}` : "";
    return request("GET", `/jobs${query}`);
  },

  async getJob(id: string): Promise<{ job: Job }> {
    return request("GET", `/jobs/${id}`);
  },

  async createJob(serverId: string, action: JobAction): Promise<{ job: Job }> {
    return request("POST", "/jobs", { serverId, action });
  },

  // Games
  async listGames(): Promise<{ games: GameDefinition[] }> {
    return request("GET", "/games");
  },

  async getGame(id: string): Promise<{ game: GameDefinition }> {
    return request("GET", `/games/${id}`);
  },

  // Stats
  async getStats(): Promise<SystemStats> {
    return request("GET", "/stats");
  },

  // Health
  async health(): Promise<{ status: string }> {
    return request("GET", "/health");
  },
};
