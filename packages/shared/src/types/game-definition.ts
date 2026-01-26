/**
 * Definition of a port required by a game server
 */
export interface PortDefinition {
  port: number;
  protocol: "tcp" | "udp" | "tcp+udp";
  description: string;
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
  ports: GamePorts;
  resources: ResourceRequirements;
  playbooks: PlaybookPaths;
  configSchema: ConfigSchema;
  /** Template for displaying server connection info */
  connectionTemplate?: ConnectionTemplate;
}
