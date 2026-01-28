import type { FastifyInstance } from "fastify";
import { serversRepo, jobsRepo } from "../db/index.js";
import { getGameDefinition, validateServerConfig, applyConfigDefaults, renderConnectionInfo } from "../config/games.js";
import { getHostConfig } from "../config/ports.js";
import { findAvailableGamePorts, createPortAllocations, releasePorts } from "../services/port-allocator.js";
import {
  CreateServerSchema,
  UpdateServerSchema,
  ListServersQuerySchema,
  ManualPortsSchema,
  DeleteServerSchema,
} from "./schemas.js";
import { ServerStatus } from "@discord-server-manager/shared";
import { generateServerPassword } from "../utils/password.js";

export async function serverRoutes(fastify: FastifyInstance) {
  // Create a new server
  fastify.post("/servers", async (request, reply) => {
    const parseResult = CreateServerSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: "Invalid request body", details: parseResult.error.issues };
    }

    const input = parseResult.data;

    // Validate game exists
    const game = getGameDefinition(input.gameId);
    if (!game) {
      reply.status(400);
      return { error: `Unknown game: ${input.gameId}` };
    }

    // Generate a password if the game has a password field in its config schema
    const configWithPassword = { ...input.config };
    if (game.configSchema?.password && !configWithPassword.password) {
      configWithPassword.password = generateServerPassword();
    }

    // Apply defaults and validate config
    const configWithDefaults = applyConfigDefaults(input.gameId, configWithPassword);
    const validation = validateServerConfig(input.gameId, configWithDefaults);
    if (!validation.valid) {
      reply.status(400);
      return { error: "Invalid server configuration", details: validation.errors };
    }

    // Try to find available ports
    let allocatedPorts;
    let portAllocationFailed = false;
    try {
      allocatedPorts = findAvailableGamePorts(game.ports);
    } catch {
      // Port allocation failed - we'll create the server anyway with pending_ports status
      allocatedPorts = {};
      portAllocationFailed = true;
    }

    // Create the server
    const server = serversRepo.createServer(
      {
        gameId: input.gameId,
        name: input.name,
        config: configWithDefaults as Record<string, string | number | boolean>,
        ownerId: input.ownerId,
        guildId: input.guildId,
      },
      allocatedPorts,
      portAllocationFailed ? ServerStatus.PendingPorts : ServerStatus.Pending
    );

    // Create port allocations if we got them
    if (!portAllocationFailed && Object.keys(allocatedPorts).length > 0) {
      createPortAllocations(server.id, allocatedPorts);
    }

    // Auto-queue a provision job if ports are allocated
    let job = null;
    if (!portAllocationFailed) {
      job = jobsRepo.createJob({
        serverId: server.id,
        action: "provision",
        notifyChannelId: input.notifyChannelId,
        notifyUserId: input.notifyUserId,
      });
    }

    // Return 202 Accepted to indicate async processing
    reply.status(202);
    return { server, job, portAllocationFailed };
  });

  // Admin endpoint: manually assign ports to a server
  fastify.patch<{ Params: { id: string } }>("/servers/:id/ports", async (request, reply) => {
    const server = serversRepo.getServerById(request.params.id);
    if (!server) {
      reply.status(404);
      return { error: "Server not found" };
    }

    const parseResult = ManualPortsSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: "Invalid request body", details: parseResult.error.issues };
    }

    const { ports } = parseResult.data;

    // Validate that the ports match the game's port requirements
    const game = getGameDefinition(server.gameId);
    if (!game) {
      reply.status(500);
      return { error: "Game definition not found for server" };
    }

    const requiredPorts = Object.keys(game.ports);
    const providedPorts = Object.keys(ports);
    const missingPorts = requiredPorts.filter((p) => !providedPorts.includes(p));
    if (missingPorts.length > 0) {
      reply.status(400);
      return { error: "Missing required ports", details: missingPorts };
    }

    // Release any existing allocations
    releasePorts(server.id);

    // Create new allocations
    createPortAllocations(server.id, ports);

    // Update server with new ports and status
    const updated = serversRepo.updateServerPorts(server.id, ports);

    return { server: updated };
  });

  // List servers
  fastify.get("/servers", async (request, reply) => {
    const parseResult = ListServersQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      reply.status(400);
      return { error: "Invalid query parameters", details: parseResult.error.issues };
    }

    const query = parseResult.data;
    let servers;

    if (query.guildId) {
      servers = serversRepo.getServersByGuild(query.guildId);
    } else if (query.ownerId) {
      servers = serversRepo.getServersByOwner(query.ownerId);
    } else if (query.status) {
      servers = serversRepo.getServersByStatus(query.status as ServerStatus);
    } else {
      servers = serversRepo.getAllServers();
    }

    // Apply additional filters
    if (query.gameId) {
      servers = servers.filter((s) => s.gameId === query.gameId);
    }
    if (query.status && query.guildId) {
      servers = servers.filter((s) => s.status === query.status);
    }
    if (query.status && query.ownerId) {
      servers = servers.filter((s) => s.status === query.status);
    }

    return { servers };
  });

  // Get a specific server
  fastify.get<{ Params: { id: string } }>("/servers/:id", async (request, reply) => {
    const server = serversRepo.getServerById(request.params.id);
    if (!server) {
      reply.status(404);
      return { error: "Server not found" };
    }

    // Include game definition info
    const game = getGameDefinition(server.gameId);

    return {
      server,
      game: game
        ? {
            id: game.id,
            name: game.name,
            steamAppId: game.steamAppId,
          }
        : null,
    };
  });

  // Get connection info for a server
  fastify.get<{ Params: { id: string } }>("/servers/:id/connection", async (request, reply) => {
    const server = serversRepo.getServerById(request.params.id);
    if (!server) {
      reply.status(404);
      return { error: "Server not found" };
    }

    if (Object.keys(server.allocatedPorts).length === 0) {
      reply.status(503);
      return { error: "Server ports not allocated yet" };
    }

    const hostConfig = getHostConfig();
    const connectionInfo = renderConnectionInfo(
      server.gameId,
      hostConfig.external,
      server.allocatedPorts,
      server.config
    );

    if (!connectionInfo) {
      reply.status(404);
      return { error: "No connection template configured for this game" };
    }

    return {
      server: {
        id: server.id,
        name: server.name,
        status: server.status,
      },
      connection: connectionInfo,
    };
  });

  // Update a server
  fastify.patch<{ Params: { id: string } }>("/servers/:id", async (request, reply) => {
    const server = serversRepo.getServerById(request.params.id);
    if (!server) {
      reply.status(404);
      return { error: "Server not found" };
    }

    const parseResult = UpdateServerSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: "Invalid request body", details: parseResult.error.issues };
    }

    const input = parseResult.data;

    // Validate config if provided
    if (input.config) {
      const mergedConfig = { ...server.config, ...input.config };
      const validation = validateServerConfig(server.gameId, mergedConfig);
      if (!validation.valid) {
        reply.status(400);
        return { error: "Invalid server configuration", details: validation.errors };
      }
    }

    const updated = serversRepo.updateServer(request.params.id, {
      name: input.name,
      config: input.config,
      internalAddress: input.internalAddress,
      status: input.status as ServerStatus | undefined,
    });

    return { server: updated };
  });

  // Delete a server (queues a delete job for proper cleanup)
  // Only the server owner can delete a server
  fastify.delete<{ Params: { id: string } }>("/servers/:id", async (request, reply) => {
    const parseResult = DeleteServerSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: "Invalid request body", details: parseResult.error.issues };
    }

    const { userId } = parseResult.data;

    const server = serversRepo.getServerById(request.params.id);
    if (!server) {
      reply.status(404);
      return { error: "Server not found" };
    }

    // Only the owner can delete a server
    if (server.ownerId !== userId) {
      reply.status(403);
      return { error: "Only the server owner can delete a server" };
    }

    // Check if server is already being deleted
    if (server.status === "deleting") {
      reply.status(409);
      return { error: "Server is already being deleted" };
    }

    // Check if server is currently provisioning
    if (server.status === "provisioning") {
      reply.status(409);
      return { error: "Wait for provisioning to complete before deleting" };
    }

    // Check for existing active jobs
    const existingJobs = jobsRepo.getJobsByServer(server.id);
    const activeJob = existingJobs.find(
      (j) => j.status === "queued" || j.status === "running"
    );
    if (activeJob) {
      reply.status(409);
      return {
        error: "Server has an active job",
        details: { jobId: activeJob.id, action: activeJob.action, status: activeJob.status },
      };
    }

    // Queue a delete job
    const job = jobsRepo.createJob({
      serverId: server.id,
      action: "delete",
    });

    // Update server status to deleting
    serversRepo.updateServer(server.id, { status: ServerStatus.Deleting });

    reply.status(202);
    return { message: "Server deletion queued", job };
  });

  // Get deleted servers (admin endpoint)
  fastify.get("/servers/deleted", async () => {
    const servers = serversRepo.getDeletedServers();
    return { servers };
  });
}
