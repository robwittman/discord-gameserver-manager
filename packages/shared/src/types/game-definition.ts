import type { ModSource } from "./server-instance.js";

/**
 * Definition of a port required by a game server
 */
export interface PortDefinition {
  port: number;
  protocol: "tcp" | "udp" | "tcp+udp";
  description: string;
}

/**
 * Mod file format and how it should be installed
 */
export type ModFileFormat =
  | "zip-extract"       // Extract ZIP to install path
  | "zip-keep"          // Keep as ZIP (e.g., Vintage Story)
  | "jar"               // Java JAR file (Minecraft)
  | "dll"               // .NET DLL (BepInEx plugins)
  | "folder"            // Directory structure
  | "cs"                // C# source (Oxide plugins)
  | "lua";              // Lua scripts

/**
 * Framework/loader required for mods (if any)
 */
export interface ModFramework {
  /** Framework name (e.g., "BepInEx", "Fabric", "Forge", "Oxide") */
  name: string;
  /** Source to download the framework from */
  source: ModSource;
  /** Identifier for the framework package */
  packageId: string;
  /** Whether the framework is required for any mods */
  required: boolean;
}

/**
 * Configuration for mod support in a game
 */
export interface ModsConfig {
  /** Whether this game supports mods */
  enabled: boolean;
  /** Primary mod source for this game */
  source: ModSource;
  /** Additional supported sources */
  additionalSources?: ModSource[];
  /** How mod files are formatted/installed */
  fileFormat: ModFileFormat;
  /** Path where mods are installed (relative to server root) */
  installPath: string;
  /** Optional framework/loader required for mods */
  framework?: ModFramework;
  /** Base URL for the mod repository (for API calls) */
  repositoryUrl?: string;
  /** Notes about mod support for this game */
  notes?: string;
}

/**
 * Map of port names to their definitions
 */
export type GamePorts = Record<string, PortDefinition>;

/**
 * Paths to Ansible playbooks for server management
 */
export interface PlaybookPaths {
  provision: string;
  start: string;
  stop: string;
  backup: string;
  update?: string;
  deprovision?: string;
  /** Playbook for installing/updating mods */
  installMods?: string;
}

/**
 * Supported types for config schema fields
 */
export type ConfigSchemaFieldType = "string" | "number" | "boolean";

/**
 * Definition of a configuration field in the game's config schema
 */
export interface ConfigSchemaField {
  type: ConfigSchemaFieldType;
  required: boolean;
  default?: string | number | boolean;
  description: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

/**
 * Schema defining configurable options for a game server
 */
export type ConfigSchema = Record<string, ConfigSchemaField>;

/**
 * Resource requirements for a game server
 */
export interface ResourceRequirements {
  minMemoryMb: number;
  recommendedMemoryMb: number;
  minCpuCores: number;
  diskSpaceGb: number;
}

/**
 * Template for displaying connection information
 * Supports placeholders: {host}, {ports.NAME}, {config.NAME}
 */
export interface ConnectionTemplate {
  /** Title for the connection info section */
  title: string;
  /** Lines of connection info with placeholders */
  lines: string[];
}

/**
 * Complete definition of a supported game
 * Loaded from YAML configuration files
 */
export interface GameDefinition {
  id: string;
  name: string;
  steamAppId?: number;
  /** LGSM server name (e.g., "vhserver" for Valheim) - enables generic LGSM playbooks */
  lgsmServerName?: string;
  ports: GamePorts;
  resources: ResourceRequirements;
  playbooks: PlaybookPaths;
  configSchema: ConfigSchema;
  /** Template for displaying server connection info */
  connectionTemplate?: ConnectionTemplate;
  /** Configuration for mod support */
  modsConfig?: ModsConfig;
}
