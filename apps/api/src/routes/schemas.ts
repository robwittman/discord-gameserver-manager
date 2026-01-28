import { z } from "zod";

// Server schemas
export const CreateServerSchema = z.object({
  gameId: z.string().min(1),
  name: z.string().min(1).max(100),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  ownerId: z.string().min(1),
  guildId: z.string().min(1),
  // Optional notification info for the provision job
  notifyChannelId: z.string().optional(),
  notifyUserId: z.string().optional(),
});

export const UpdateServerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  internalAddress: z.string().ip().optional(),
  status: z.enum(["pending_ports", "pending", "provisioning", "running", "stopped", "error", "deleting"]).optional(),
});

export const ListServersQuerySchema = z.object({
  guildId: z.string().optional(),
  ownerId: z.string().optional(),
  gameId: z.string().optional(),
  status: z.enum(["pending_ports", "pending", "provisioning", "running", "stopped", "error", "deleting"]).optional(),
});

// Job schemas
export const CreateJobSchema = z.object({
  action: z.enum(["provision", "start", "stop", "backup", "update", "deprovision", "delete", "install-mods"]),
});

// Admin schemas
export const ManualPortsSchema = z.object({
  ports: z.record(z.string(), z.number().int().min(1).max(65535)),
});

// Delete server schema - requires userId for authorization
export const DeleteServerSchema = z.object({
  userId: z.string().min(1),
});

// Mod schemas
const ModSourceSchema = z.enum([
  "thunderstore",
  "vintagestory",
  "curseforge",
  "steam-workshop",
  "nexusmods",
  "github",
  "url",
  "manual",
]);

export const ModEntrySchema = z.object({
  source: ModSourceSchema,
  id: z.string().min(1),
  version: z.string().optional(),
  enabled: z.boolean().default(true),
  name: z.string().optional(),
});

export const UpdateModsSchema = z.object({
  mods: z.array(ModEntrySchema),
});

export const AddModSchema = z.object({
  source: ModSourceSchema.optional(), // If not provided, uses game's default source
  id: z.string().min(1),
  version: z.string().optional(),
  enabled: z.boolean().default(true),
  name: z.string().optional(),
});

// Type exports
export type CreateServerInput = z.infer<typeof CreateServerSchema>;
export type UpdateServerInput = z.infer<typeof UpdateServerSchema>;
export type ListServersQuery = z.infer<typeof ListServersQuerySchema>;
export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type DeleteServerInput = z.infer<typeof DeleteServerSchema>;
export type ModEntryInput = z.infer<typeof ModEntrySchema>;
export type UpdateModsInput = z.infer<typeof UpdateModsSchema>;
export type AddModInput = z.infer<typeof AddModSchema>;
