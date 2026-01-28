import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ServerMetrics } from "@discord-server-manager/shared";

const SSH_PRIVATE_KEY =
  process.env.SSH_PRIVATE_KEY_PATH ??
  join(process.env.HOME ?? "", ".ssh/id_ed25519");

const CACHE_TTL_MS = 30 * 1000; // 30 seconds

interface CacheEntry {
  metrics: ServerMetrics;
  timestamp: number;
}

const metricsCache = new Map<string, CacheEntry>();

/**
 * Execute an SSH command on a remote server
 */
async function sshExec(
  host: string,
  command: string,
  timeoutMs = 10000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "UserKnownHostsFile=/dev/null",
      "-o",
      "ConnectTimeout=5",
      "-o",
      "BatchMode=yes",
    ];

    if (existsSync(SSH_PRIVATE_KEY)) {
      args.push("-i", SSH_PRIVATE_KEY);
    }

    args.push(`root@${host}`, command);

    const proc = spawn("ssh", args, {
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`SSH connection failed: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`SSH command failed (code ${code}): ${stderr}`));
      }
    });

    setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("SSH command timed out"));
    }, timeoutMs);
  });
}

/**
 * Parse memory information from /proc/meminfo
 */
function parseMemoryInfo(meminfo: string): {
  used: number;
  total: number;
  percent: number;
} {
  const lines = meminfo.split("\n");
  const values: Record<string, number> = {};

  for (const line of lines) {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match && match[1] && match[2]) {
      values[match[1]] = parseInt(match[2], 10) * 1024; // Convert kB to bytes
    }
  }

  const total = values["MemTotal"] ?? 0;
  const free = values["MemFree"] ?? 0;
  const buffers = values["Buffers"] ?? 0;
  const cached = values["Cached"] ?? 0;
  const available = values["MemAvailable"] ?? free + buffers + cached;

  const used = total - available;
  const percent = total > 0 ? (used / total) * 100 : 0;

  return { used, total, percent };
}

/**
 * Parse disk usage from df output
 */
function parseDiskUsage(dfOutput: string): {
  used: number;
  total: number;
  percent: number;
  path: string;
} {
  const lines = dfOutput.trim().split("\n");
  // Skip header line, get first filesystem (usually /)
  const dataLine = lines[1];
  if (!dataLine) {
    return { used: 0, total: 0, percent: 0, path: "/" };
  }

  const parts = dataLine.split(/\s+/);
  // df -B1 output: Filesystem, 1B-blocks, Used, Available, Use%, Mounted
  const total = parseInt(parts[1] ?? "0", 10);
  const used = parseInt(parts[2] ?? "0", 10);
  const percentStr = parts[4] ?? "0%";
  const percent = parseFloat(percentStr.replace("%", ""));
  const path = parts[5] ?? "/";

  return { used, total, percent, path };
}

/**
 * Parse CPU usage from /proc/stat
 */
function parseCpuUsage(statOutput: string): { usage: number; cores: number } {
  const lines = statOutput.split("\n");
  let cores = 0;
  let totalUsage = 0;

  for (const line of lines) {
    if (line.startsWith("cpu") && !line.startsWith("cpu ")) {
      cores++;
      const parts = line.split(/\s+/).slice(1).map(Number);
      const [user = 0, nice = 0, system = 0, idle = 0] = parts;
      const total = user + nice + system + idle;
      const usage = total > 0 ? ((user + nice + system) / total) * 100 : 0;
      totalUsage += usage;
    }
  }

  // Average CPU usage across all cores
  const avgUsage = cores > 0 ? totalUsage / cores : 0;

  return { usage: avgUsage, cores };
}

/**
 * Parse uptime from /proc/uptime
 */
function parseUptime(uptimeOutput: string): number {
  const parts = uptimeOutput.trim().split(/\s+/);
  return parseFloat(parts[0] ?? "0");
}

/**
 * Collect server metrics via SSH
 */
export async function collectServerMetrics(
  internalAddress: string
): Promise<ServerMetrics> {
  // Check cache first
  const cached = metricsCache.get(internalAddress);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.metrics;
  }

  // Run all commands in a single SSH session for efficiency
  const command = `
    cat /proc/meminfo
    echo "---SEPARATOR---"
    df -B1 /
    echo "---SEPARATOR---"
    cat /proc/stat
    echo "---SEPARATOR---"
    cat /proc/uptime
  `.trim();

  const output = await sshExec(internalAddress, command);
  const parts = output.split("---SEPARATOR---");

  const [meminfoOutput = "", dfOutput = "", statOutput = "", uptimeOutput = ""] =
    parts.map((p) => p.trim());

  const memory = parseMemoryInfo(meminfoOutput);
  const disk = parseDiskUsage(dfOutput);
  const cpu = parseCpuUsage(statOutput);
  const uptime = parseUptime(uptimeOutput);

  const metrics: ServerMetrics = {
    cpu,
    memory,
    disk,
    uptime,
    timestamp: new Date().toISOString(),
  };

  // Update cache
  metricsCache.set(internalAddress, {
    metrics,
    timestamp: Date.now(),
  });

  return metrics;
}

/**
 * Clear the metrics cache (useful for testing)
 */
export function clearMetricsCache(): void {
  metricsCache.clear();
}
