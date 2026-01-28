import type { FastifyInstance } from "fastify";
import { serversRepo } from "../db/index.js";
import { getGameDefinition } from "../config/games.js";
import { UpdateModsSchema, AddModSchema } from "./schemas.js";
import type { ModEntry } from "@discord-server-manager/shared";

export async function modRoutes(fastify: FastifyInstance) {
  // Get mods for a server
  fastify.get<{ Params: { serverId: string } }>(
    "/servers/:serverId/mods",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const game = getGameDefinition(server.gameId);
      const modsConfig = game?.modsConfig;

      return {
        mods: server.mods ?? [],
        modsConfig: modsConfig
          ? {
              enabled: modsConfig.enabled,
              source: modsConfig.source,
              additionalSources: modsConfig.additionalSources,
              fileFormat: modsConfig.fileFormat,
              installPath: modsConfig.installPath,
              repositoryUrl: modsConfig.repositoryUrl,
              framework: modsConfig.framework,
              notes: modsConfig.notes,
            }
          : null,
      };
    }
  );

  // Replace all mods for a server
  fastify.put<{ Params: { serverId: string } }>(
    "/servers/:serverId/mods",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const game = getGameDefinition(server.gameId);
      if (!game?.modsConfig?.enabled) {
        reply.status(400);
        return { error: "This game does not support mods" };
      }

      const parseResult = UpdateModsSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: "Invalid request body", details: parseResult.error.issues };
      }

      const { mods } = parseResult.data;

      // Validate mod sources
      const validSources = [
        game.modsConfig.source,
        ...(game.modsConfig.additionalSources ?? []),
      ];
      for (const mod of mods) {
        if (!validSources.includes(mod.source)) {
          reply.status(400);
          return {
            error: `Invalid mod source: ${mod.source}`,
            details: `Supported sources for ${game.name}: ${validSources.join(", ")}`,
          };
        }
      }

      const updated = serversRepo.updateServerMods(server.id, mods as ModEntry[]);
      if (!updated) {
        reply.status(500);
        return { error: "Failed to update mods" };
      }

      return { mods: updated.mods ?? [] };
    }
  );

  // Add a mod to a server
  fastify.post<{ Params: { serverId: string } }>(
    "/servers/:serverId/mods",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const game = getGameDefinition(server.gameId);
      if (!game?.modsConfig?.enabled) {
        reply.status(400);
        return { error: "This game does not support mods" };
      }

      const parseResult = AddModSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: "Invalid request body", details: parseResult.error.issues };
      }

      const input = parseResult.data;
      const source = input.source ?? game.modsConfig.source;

      // Validate mod source
      const validSources = [
        game.modsConfig.source,
        ...(game.modsConfig.additionalSources ?? []),
      ];
      if (!validSources.includes(source)) {
        reply.status(400);
        return {
          error: `Invalid mod source: ${source}`,
          details: `Supported sources for ${game.name}: ${validSources.join(", ")}`,
        };
      }

      const currentMods = server.mods ?? [];

      // Check if mod already exists
      const existingIndex = currentMods.findIndex(
        (m) => m.source === source && m.id === input.id
      );
      if (existingIndex !== -1) {
        reply.status(409);
        return { error: "Mod already exists", mod: currentMods[existingIndex] };
      }

      const newMod: ModEntry = {
        source,
        id: input.id,
        version: input.version,
        enabled: input.enabled ?? true,
        name: input.name,
      };

      const updatedMods = [...currentMods, newMod];
      const updated = serversRepo.updateServerMods(server.id, updatedMods);
      if (!updated) {
        reply.status(500);
        return { error: "Failed to add mod" };
      }

      reply.status(201);
      return { mod: newMod, mods: updated.mods ?? [] };
    }
  );

  // Remove a mod from a server
  fastify.delete<{ Params: { serverId: string; modId: string }; Querystring: { source?: string } }>(
    "/servers/:serverId/mods/:modId",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const game = getGameDefinition(server.gameId);
      const source = request.query.source ?? game?.modsConfig?.source;
      const modId = request.params.modId;

      const currentMods = server.mods ?? [];
      const modIndex = currentMods.findIndex(
        (m) => m.id === modId && (!source || m.source === source)
      );

      if (modIndex === -1) {
        reply.status(404);
        return { error: "Mod not found" };
      }

      const removedMod = currentMods[modIndex];
      const updatedMods = currentMods.filter((_, i) => i !== modIndex);
      const updated = serversRepo.updateServerMods(server.id, updatedMods);

      if (!updated) {
        reply.status(500);
        return { error: "Failed to remove mod" };
      }

      return { removed: removedMod, mods: updated.mods ?? [] };
    }
  );

  // Toggle mod enabled/disabled
  fastify.patch<{ Params: { serverId: string; modId: string }; Querystring: { source?: string } }>(
    "/servers/:serverId/mods/:modId",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const game = getGameDefinition(server.gameId);
      const source = request.query.source ?? game?.modsConfig?.source;
      const modId = request.params.modId;

      const currentMods = server.mods ?? [];
      const modIndex = currentMods.findIndex(
        (m) => m.id === modId && (!source || m.source === source)
      );

      const existingMod = currentMods[modIndex];
      if (modIndex === -1 || !existingMod) {
        reply.status(404);
        return { error: "Mod not found" };
      }

      // Parse optional body for updates
      const body = request.body as { enabled?: boolean; version?: string; name?: string } | undefined;

      const updatedMods = [...currentMods];
      updatedMods[modIndex] = {
        source: existingMod.source,
        id: existingMod.id,
        enabled: body?.enabled ?? !existingMod.enabled,
        version: body?.version ?? existingMod.version,
        name: body?.name ?? existingMod.name,
      };

      const updated = serversRepo.updateServerMods(server.id, updatedMods);
      if (!updated) {
        reply.status(500);
        return { error: "Failed to update mod" };
      }

      return { mod: updatedMods[modIndex], mods: updated.mods ?? [] };
    }
  );
}
