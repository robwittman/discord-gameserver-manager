export interface ServerMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percent: number;
  };
  disk: {
    used: number;
    total: number;
    percent: number;
    path: string;
  };
  uptime: number;
  timestamp: string;
}
