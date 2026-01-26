import type { FastifyInstance } from "fastify";
import { serversRepo, managersRepo } from "../db/index.js";
import { z } from "zod";

const AddManagerSchema = z.object({
  userId: z.string().min(1),
  grantedBy: z.string().min(1),
});

export async function managerRoutes(fastify: FastifyInstance) {
  // Get managers for a server
  fastify.get<{ Params: { serverId: string } }>(
    "/servers/:serverId/managers",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const managers = managersRepo.getManagersByServer(server.id);
      return {
        ownerId: server.ownerId,
        managers,
      };
    }
  );

  // Add a manager to a server
  fastify.post<{ Params: { serverId: string } }>(
    "/servers/:serverId/managers",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const parseResult = AddManagerSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: "Invalid request body", details: parseResult.error.issues };
      }

      const { userId, grantedBy } = parseResult.data;

      // Check if granter can manage the server
      if (!managersRepo.canManageServer(server.id, grantedBy, server.ownerId)) {
        reply.status(403);
        return { error: "You do not have permission to add managers to this server" };
      }

      // Cannot add owner as manager
      if (userId === server.ownerId) {
        reply.status(400);
        return { error: "Cannot add owner as manager" };
      }

      // Check if already a manager
      if (managersRepo.isManager(server.id, userId)) {
        reply.status(409);
        return { error: "User is already a manager" };
      }

      const manager = managersRepo.addManager(server.id, userId, grantedBy);
      reply.status(201);
      return { manager };
    }
  );

  // Remove a manager from a server
  fastify.delete<{ Params: { serverId: string; userId: string } }>(
    "/servers/:serverId/managers/:userId",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const { userId } = request.params;

      // Note: Authorization should be checked by the caller (e.g., Discord bot)
      // Here we just perform the operation

      const removed = managersRepo.removeManager(server.id, userId);
      if (!removed) {
        reply.status(404);
        return { error: "Manager not found" };
      }

      reply.status(204);
      return null;
    }
  );

  // Check if a user can manage a server
  fastify.get<{ Params: { serverId: string }; Querystring: { userId: string } }>(
    "/servers/:serverId/can-manage",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const { userId } = request.query;
      if (!userId) {
        reply.status(400);
        return { error: "userId query parameter required" };
      }

      const canManage = managersRepo.canManageServer(server.id, userId, server.ownerId);
      const isOwner = userId === server.ownerId;

      return {
        canManage,
        isOwner,
        isManager: canManage && !isOwner,
      };
    }
  );
}
