import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "../../../../config/proxmox.yaml");

const TemplateSchema = z.object({
  vmId: z.number().int().positive(),
  node: z.string().optional(),
  description: z.string().optional(),
  cores: z.number().int().positive().default(2),
  memory: z.number().int().positive().default(4096),
  disk: z.number().int().positive().default(32),
});

const CloudInitSchema = z.object({
  /** SSH public key for accessing VMs */
  sshPublicKey: z.string().optional(),
  /** Default user for cloud-init (default: gameserver) */
  user: z.string().default("gameserver"),
  /** Password for the cloud-init user (for console access) */
  password: z.string().optional(),
  /** DNS domain for VMs */
  searchDomain: z.string().optional(),
  /** DNS nameserver */
  nameserver: z.string().optional(),
  /** Custom user-data snippet path (e.g., "local:snippets/gameserver-init.yaml") */
  customUserData: z.string().optional(),
});

const TimeoutsSchema = z.object({
  clone: z.number().int().positive().default(120),
  start: z.number().int().positive().default(60),
  guestAgent: z.number().int().positive().default(180),
});

const ProxmoxConfigSchema = z.object({
  host: z.string().url(),
  tokenId: z.string(),
  tokenSecret: z.string().default(""),
  defaultNode: z.string().default("pve"),
  vmIdRange: z.object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  }),
  storage: z.string().default("local-lvm"),
  networkBridge: z.string().default("vmbr0"),
  /** VLAN tag for VM network interface (optional) */
  vlanTag: z.number().int().min(1).max(4094).optional(),
  /** Base cloud image VM ID to clone from (e.g., Ubuntu Cloud image) */
  baseImageVmId: z.number().int().positive().optional(),
  /** Default VM resources */
  defaultResources: z.object({
    cores: z.number().int().positive().default(2),
    memory: z.number().int().positive().default(4096),
    disk: z.number().int().positive().default(32),
  }).default({}),
  /** Cloud-init configuration */
  cloudInit: CloudInitSchema.default({}),
  /** Legacy: named templates (optional, for complex setups) */
  templates: z.record(z.string(), TemplateSchema),
  gameTemplates: z.record(z.string(), z.string()),
  timeouts: TimeoutsSchema.default({}),
});

export type ProxmoxConfig = z.infer<typeof ProxmoxConfigSchema>;
export type TemplateConfig = z.infer<typeof TemplateSchema>;

let cachedConfig: ProxmoxConfig | null = null;

function loadConfig(): ProxmoxConfig {
  // Start with environment-based configuration
  const config: ProxmoxConfig = {
    host: process.env.PROXMOX_HOST ?? "https://localhost:8006",
    tokenId: process.env.PROXMOX_TOKEN_ID ?? "",
    tokenSecret: process.env.PROXMOX_TOKEN_SECRET ?? "",
    defaultNode: process.env.PROXMOX_NODE ?? "pve",
    vmIdRange: {
      start: parseInt(process.env.PROXMOX_VMID_START ?? "200", 10),
      end: parseInt(process.env.PROXMOX_VMID_END ?? "299", 10),
    },
    storage: process.env.PROXMOX_STORAGE ?? "local-lvm",
    networkBridge: process.env.PROXMOX_NETWORK_BRIDGE ?? "vmbr0",
    vlanTag: process.env.PROXMOX_VLAN_TAG
      ? parseInt(process.env.PROXMOX_VLAN_TAG, 10)
      : undefined,
    // Base cloud image VM ID (e.g., Ubuntu Cloud image imported into Proxmox)
    baseImageVmId: process.env.PROXMOX_BASE_IMAGE_VMID
      ? parseInt(process.env.PROXMOX_BASE_IMAGE_VMID, 10)
      : undefined,
    defaultResources: {
      cores: parseInt(process.env.PROXMOX_DEFAULT_CORES ?? "2", 10),
      memory: parseInt(process.env.PROXMOX_DEFAULT_MEMORY ?? "4096", 10),
      disk: parseInt(process.env.PROXMOX_DEFAULT_DISK ?? "32", 10),
    },
    cloudInit: {
      sshPublicKey: process.env.PROXMOX_SSH_PUBLIC_KEY,
      user: process.env.PROXMOX_CI_USER ?? "gameserver",
      password: process.env.PROXMOX_CI_PASSWORD,
      searchDomain: process.env.PROXMOX_CI_SEARCH_DOMAIN,
      nameserver: process.env.PROXMOX_CI_NAMESERVER,
      customUserData: process.env.PROXMOX_CI_CUSTOM_USER_DATA,
    },
    templates: {},
    gameTemplates: {},
    timeouts: {
      clone: parseInt(process.env.PROXMOX_TIMEOUT_CLONE ?? "120", 10),
      start: parseInt(process.env.PROXMOX_TIMEOUT_START ?? "60", 10),
      guestAgent: parseInt(process.env.PROXMOX_TIMEOUT_GUEST_AGENT ?? "180", 10),
    },
  };

  // Parse game-specific resource overrides from environment
  // PROXMOX_RESOURCES_VALHEIM="4:8192:50" (cores:memory:disk)
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^PROXMOX_RESOURCES_(\w+)$/);
    if (match?.[1] && value) {
      const gameId = match[1].toLowerCase();
      const parts = value.split(":");
      config.templates[gameId] = {
        vmId: config.baseImageVmId ?? 9000, // Use base image
        cores: parts[0] ? parseInt(parts[0], 10) || 2 : 2,
        memory: parts[1] ? parseInt(parts[1], 10) || 4096 : 4096,
        disk: parts[2] ? parseInt(parts[2], 10) || 32 : 32,
      };
      config.gameTemplates[gameId] = gameId;
    }
  }

  // Optionally load YAML file for more complex configurations
  // This allows power users to define multiple templates with descriptions, etc.
  if (existsSync(CONFIG_PATH)) {
    try {
      const content = readFileSync(CONFIG_PATH, "utf-8");
      const fileConfig = yaml.load(content) as Record<string, unknown>;

      // Merge templates from file (file takes precedence for complex configs)
      if (fileConfig.templates && typeof fileConfig.templates === "object") {
        for (const [name, templateRaw] of Object.entries(fileConfig.templates)) {
          const parsed = TemplateSchema.safeParse(templateRaw);
          if (parsed.success) {
            config.templates[name] = parsed.data;
          }
        }
      }

      // Merge game template mappings from file
      if (fileConfig.gameTemplates && typeof fileConfig.gameTemplates === "object") {
        for (const [gameId, templateName] of Object.entries(fileConfig.gameTemplates)) {
          if (typeof templateName === "string") {
            config.gameTemplates[gameId] = templateName;
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load proxmox.yaml, using environment config only:", error);
    }
  }

  return config;
}

/**
 * Get Proxmox configuration
 */
export function getProxmoxConfig(): ProxmoxConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Reload Proxmox configuration from disk
 */
export function reloadProxmoxConfig(): void {
  cachedConfig = loadConfig();
}

/**
 * Get template config for a game
 */
export function getTemplateForGame(gameId: string): TemplateConfig | null {
  const config = getProxmoxConfig();
  const templateName = config.gameTemplates[gameId];

  if (!templateName) {
    return null;
  }

  return config.templates[templateName] ?? null;
}

/**
 * Check if Proxmox is configured
 */
export function isProxmoxConfigured(): boolean {
  const config = getProxmoxConfig();
  return !!(config.host && config.tokenId && config.tokenSecret);
}
