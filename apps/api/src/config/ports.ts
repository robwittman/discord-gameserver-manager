import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import type { PortConfig, PortPool, HostConfig } from "@discord-server-manager/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = join(__dirname, "../../../../config/ports.yaml");

const PortPoolSchema = z.object({
  start: z.number().int().min(1).max(65535),
  end: z.number().int().min(1).max(65535),
  description: z.string(),
}).refine((data) => data.end > data.start, {
  message: "Pool end must be greater than start",
});

const HostConfigSchema = z.object({
  internal: z.string(),
  external: z.string(),
});

const PortConfigSchema = z.object({
  pools: z.record(z.string(), PortPoolSchema),
  host: HostConfigSchema,
});

let cachedConfig: PortConfig | null = null;

function loadPortConfig(): PortConfig {
  // Start with environment-based configuration
  const config: PortConfig = {
    pools: {
      game: {
        start: parseInt(process.env.PORT_POOL_GAME_START ?? "27000", 10),
        end: parseInt(process.env.PORT_POOL_GAME_END ?? "27499", 10),
        description: "Game server ports",
      },
      sftp: {
        start: parseInt(process.env.PORT_POOL_SFTP_START ?? "2200", 10),
        end: parseInt(process.env.PORT_POOL_SFTP_END ?? "2299", 10),
        description: "SFTP access ports",
      },
    },
    host: {
      internal: process.env.HOST_INTERNAL ?? "127.0.0.1",
      external: process.env.HOST_EXTERNAL ?? "0.0.0.0",
    },
  };

  // Optionally load from YAML file (for custom pool configurations)
  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, "utf-8");
      const fileConfig = PortConfigSchema.parse(yaml.load(content));

      // Merge pools from file
      for (const [name, pool] of Object.entries(fileConfig.pools)) {
        config.pools[name] = pool;
      }

      // Use host config from file if present
      if (fileConfig.host) {
        config.host = fileConfig.host;
      }
    } catch (error) {
      console.warn("Failed to load ports.yaml, using environment config:", error);
    }
  }

  // Environment always takes precedence for host config
  if (process.env.HOST_INTERNAL) {
    config.host.internal = process.env.HOST_INTERNAL;
  }
  if (process.env.HOST_EXTERNAL) {
    config.host.external = process.env.HOST_EXTERNAL;
  }

  return config;
}

/**
 * Get the port configuration
 */
export function getPortConfig(): PortConfig {
  if (!cachedConfig) {
    cachedConfig = loadPortConfig();
    console.log("Loaded port configuration");
  }
  return cachedConfig;
}

/**
 * Get a specific port pool by name
 */
export function getPortPool(name: string): PortPool | undefined {
  return getPortConfig().pools[name];
}

/**
 * Get the host configuration
 */
export function getHostConfig(): HostConfig {
  return getPortConfig().host;
}

/**
 * Reload port configuration from disk
 */
export function reloadPortConfig(): void {
  cachedConfig = loadPortConfig();
}

/**
 * Get the total number of ports available in a pool
 */
export function getPoolSize(poolName: string): number {
  const pool = getPortPool(poolName);
  if (!pool) {
    return 0;
  }
  return pool.end - pool.start + 1;
}
