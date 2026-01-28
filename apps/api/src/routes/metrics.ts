import type { FastifyInstance } from "fastify";
import { serversRepo } from "../db/index.js";
import { collectServerMetrics } from "../services/metrics.js";
import { ServerStatus } from "@discord-server-manager/shared";

export async function metricsRoutes(fastify: FastifyInstance) {
  // Get server metrics
  fastify.get<{ Params: { id: string } }>(
    "/servers/:id/metrics",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.id);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      // Only running servers have metrics
      if (server.status !== ServerStatus.Running) {
        reply.status(400);
        return {
          error: "Server is not running",
          status: server.status,
        };
      }

      // Need internal address to collect metrics
      if (!server.internalAddress) {
        reply.status(400);
        return { error: "Server has no internal address" };
      }

      try {
        const metrics = await collectServerMetrics(server.internalAddress);
        return { metrics };
      } catch (error) {
        reply.status(500);
        return {
          error: "Failed to collect metrics",
          details: error instanceof Error ? error.message : String(error),
        };
      }
    }
  );
}
