import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { z } from "zod";
import type { GameDefinition } from "@discord-server-manager/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "../../../../config/games");

const PortDefinitionSchema = z.object({
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(["tcp", "udp", "tcp+udp"]),
  description: z.string(),
});

const PlaybookPathsSchema = z.object({
  provision: z.string(),
  start: z.string(),
  stop: z.string(),
  backup: z.string(),
  update: z.string().optional(),
  deprovision: z.string().optional(),
});

const ConfigSchemaFieldSchema = z.object({
  type: z.enum(["string", "number", "boolean"]),
  required: z.boolean(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  description: z.string(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
});

const ResourceRequirementsSchema = z.object({
  minMemoryMb: z.number().int().positive(),
  recommendedMemoryMb: z.number().int().positive(),
  minCpuCores: z.number().int().positive(),
  diskSpaceGb: z.number().positive(),
});

const ConnectionTemplateSchema = z.object({
  title: z.string(),
  lines: z.array(z.string()),
});

const GameDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  steamAppId: z.number().int().positive().optional(),
  /** LGSM server name (e.g., "vhserver" for Valheim) - enables generic LGSM playbooks */
  lgsmServerName: z.string().optional(),
  ports: z.record(z.string(), PortDefinitionSchema),
  resources: ResourceRequirementsSchema,
  playbooks: PlaybookPathsSchema,
  configSchema: z.record(z.string(), ConfigSchemaFieldSchema),
  connectionTemplate: ConnectionTemplateSchema.optional(),
});

let cachedDefinitions: Map<string, GameDefinition> | null = null;

function loadGameDefinition(filePath: string): GameDefinition {
  const content = readFileSync(filePath, "utf-8");
  const raw = yaml.load(content);
  return GameDefinitionSchema.parse(raw);
}

function loadAllGameDefinitions(): Map<string, GameDefinition> {
  const definitions = new Map<string, GameDefinition>();

  let files: string[];
  try {
    files = readdirSync(CONFIG_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    console.warn(`Game config directory not found: ${CONFIG_DIR}`);
    return definitions;
  }

  for (const file of files) {
    const filePath = join(CONFIG_DIR, file);
    try {
      const definition = loadGameDefinition(filePath);
      definitions.set(definition.id, definition);
      console.log(`Loaded game definition: ${definition.id}`);
    } catch (error) {
      console.error(`Failed to load game definition from ${file}:`, error);
    }
  }

  return definitions;
}

/**
 * Get all loaded game definitions
 */
export function getGameDefinitions(): Map<string, GameDefinition> {
  if (!cachedDefinitions) {
    cachedDefinitions = loadAllGameDefinitions();
  }
  return cachedDefinitions;
}

/**
 * Get a specific game definition by ID
 */
export function getGameDefinition(id: string): GameDefinition | undefined {
  return getGameDefinitions().get(id);
}

/**
 * List all available games
 */
export function listGames(): GameDefinition[] {
  return Array.from(getGameDefinitions().values());
}

/**
 * Reload game definitions from disk
 * Useful for development or SIGHUP handling
 */
export function reloadGameDefinitions(): void {
  cachedDefinitions = loadAllGameDefinitions();
}

/**
 * Validate a server config against a game's config schema
 */
export function validateServerConfig(
  gameId: string,
  config: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const game = getGameDefinition(gameId);
  if (!game) {
    return { valid: false, errors: [`Unknown game: ${gameId}`] };
  }

  const errors: string[] = [];

  for (const [fieldName, fieldDef] of Object.entries(game.configSchema)) {
    const value = config[fieldName];

    if (fieldDef.required && value === undefined) {
      errors.push(`Missing required field: ${fieldName}`);
      continue;
    }

    if (value === undefined) {
      continue;
    }

    const actualType = typeof value;
    if (actualType !== fieldDef.type) {
      errors.push(`Field ${fieldName} must be ${fieldDef.type}, got ${actualType}`);
      continue;
    }

    if (fieldDef.type === "string" && typeof value === "string") {
      if (fieldDef.minLength !== undefined && value.length < fieldDef.minLength) {
        errors.push(`Field ${fieldName} must be at least ${fieldDef.minLength} characters`);
      }
      if (fieldDef.maxLength !== undefined && value.length > fieldDef.maxLength) {
        errors.push(`Field ${fieldName} must be at most ${fieldDef.maxLength} characters`);
      }
      if (fieldDef.pattern !== undefined && !new RegExp(fieldDef.pattern).test(value)) {
        errors.push(`Field ${fieldName} must match pattern: ${fieldDef.pattern}`);
      }
    }

    if (fieldDef.type === "number" && typeof value === "number") {
      if (fieldDef.min !== undefined && value < fieldDef.min) {
        errors.push(`Field ${fieldName} must be at least ${fieldDef.min}`);
      }
      if (fieldDef.max !== undefined && value > fieldDef.max) {
        errors.push(`Field ${fieldName} must be at most ${fieldDef.max}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Apply default values from config schema to a partial config
 */
export function applyConfigDefaults(
  gameId: string,
  config: Record<string, unknown>
): Record<string, unknown> {
  const game = getGameDefinition(gameId);
  if (!game) {
    return config;
  }

  const result = { ...config };

  for (const [fieldName, fieldDef] of Object.entries(game.configSchema)) {
    if (result[fieldName] === undefined && fieldDef.default !== undefined) {
      result[fieldName] = fieldDef.default;
    }
  }

  return result;
}

/**
 * Render connection template for a server instance
 */
export function renderConnectionInfo(
  gameId: string,
  host: string,
  ports: Record<string, number>,
  config: Record<string, unknown>
): { title: string; lines: string[] } | null {
  const game = getGameDefinition(gameId);
  if (!game || !game.connectionTemplate) {
    return null;
  }

  const { title, lines } = game.connectionTemplate;

  const renderedLines = lines.map((line) => {
    return line
      .replace(/\{host\}/g, host)
      .replace(/\{ports\.(\w+)\}/g, (_, portName) => String(ports[portName] ?? "N/A"))
      .replace(/\{config\.(\w+)\}/g, (_, configName) => String(config[configName] ?? "N/A"));
  });

  return { title, lines: renderedLines };
}
