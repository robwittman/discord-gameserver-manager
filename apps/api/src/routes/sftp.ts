import type { FastifyInstance } from "fastify";
import { serversRepo, sftpRepo, jobsRepo } from "../db/index.js";
import { allocateSftpPort } from "../services/port-allocator.js";
import { getHostConfig } from "../config/ports.js";
import { generateServerPassword } from "../utils/password.js";
import { getUniFiClient, isUniFiConfigured } from "../services/unifi.js";
import { createHash } from "node:crypto";
import type { SftpCredentials } from "@discord-server-manager/shared";

/**
 * Hash a password using SHA-512 (for storage, not for system auth)
 * Note: The actual system password is set by Ansible using password_hash('sha512')
 */
function hashPassword(password: string): string {
  return createHash("sha512").update(password).digest("hex");
}

export async function sftpRoutes(fastify: FastifyInstance) {
  // Enable SFTP access for a server
  fastify.post<{ Params: { serverId: string }; Body: { userId: string } }>(
    "/servers/:serverId/sftp",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      // Check if server is provisioned
      if (!server.internalAddress) {
        reply.status(400);
        return { error: "Server must be provisioned before enabling SFTP access" };
      }

      // Check if SFTP is already enabled
      const existingAccess = sftpRepo.getSftpAccessByServerId(server.id);
      if (existingAccess) {
        reply.status(409);
        return { error: "SFTP access already enabled for this server" };
      }

      // Get user ID from request body
      const { userId } = request.body ?? { userId: server.ownerId };

      // Allocate SFTP port
      let sftpPort: number;
      try {
        sftpPort = allocateSftpPort(server.id);
      } catch (err) {
        reply.status(503);
        return { error: "No SFTP ports available", details: err instanceof Error ? err.message : String(err) };
      }

      // Generate password
      const password = generateServerPassword(16);
      const passwordHash = hashPassword(password);

      // Build Linux username (gs_{serverid truncated})
      const username = `gs_${server.id.replace(/-/g, "").slice(0, 8)}`;

      // Store the password temporarily in server config for the job to use
      const currentConfig = server.config as Record<string, string | number | boolean>;
      serversRepo.updateServer(server.id, {
        config: {
          ...currentConfig,
          _sftpPassword: password,
        },
      });

      // Create SFTP access record
      sftpRepo.createSftpAccess(server.id, userId, username, passwordHash, sftpPort);

      // Queue setup-sftp job
      const job = jobsRepo.createJob({
        serverId: server.id,
        action: "setup-sftp",
      });

      // Create UniFi port forward for SFTP (external port -> internal SSH port 22)
      if (isUniFiConfigured() && server.internalAddress) {
        try {
          const unifi = getUniFiClient();
          if (unifi) {
            const ruleName = `gs-${server.id.slice(0, 8)}-sftp`;

            // Check if rule already exists
            const existing = await unifi.findPortForwardByName(ruleName);
            if (!existing) {
              await unifi.createPortForward({
                name: ruleName,
                externalPort: sftpPort,
                internalIp: server.internalAddress,
                internalPort: 22, // SSH port
                protocol: "tcp",
              });
            }
          }
        } catch (err) {
          // Log but don't fail - port forward can be set up manually
          fastify.log.warn(`Failed to create SFTP port forward: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const hostConfig = getHostConfig();

      const credentials: SftpCredentials = {
        host: hostConfig.external,
        port: sftpPort,
        username,
        password,
        path: "/serverfiles",
      };

      reply.status(201);
      return { credentials, job };
    }
  );

  // Get SFTP info for a server (no password)
  fastify.get<{ Params: { serverId: string } }>(
    "/servers/:serverId/sftp",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const access = sftpRepo.getSftpAccessByServerId(server.id);
      if (!access) {
        reply.status(404);
        return { error: "SFTP access not enabled for this server" };
      }

      const hostConfig = getHostConfig();

      return {
        enabled: true,
        host: hostConfig.external,
        port: access.port,
        username: access.username,
        path: "/serverfiles",
        createdAt: access.createdAt,
      };
    }
  );

  // Disable SFTP access for a server
  fastify.delete<{ Params: { serverId: string } }>(
    "/servers/:serverId/sftp",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const access = sftpRepo.getSftpAccessByServerId(server.id);
      if (!access) {
        reply.status(404);
        return { error: "SFTP access not enabled for this server" };
      }

      // Queue disable-sftp job
      const job = jobsRepo.createJob({
        serverId: server.id,
        action: "disable-sftp",
      });

      // Delete UniFi port forward for SFTP
      if (isUniFiConfigured()) {
        try {
          const unifi = getUniFiClient();
          if (unifi) {
            const ruleName = `gs-${server.id.slice(0, 8)}-sftp`;
            const rule = await unifi.findPortForwardByName(ruleName);
            if (rule?._id) {
              await unifi.deletePortForward(rule._id);
            }
          }
        } catch (err) {
          // Log but don't fail
          fastify.log.warn(`Failed to delete SFTP port forward: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return { message: "SFTP access disable queued", job };
    }
  );

  // Reset SFTP password
  fastify.post<{ Params: { serverId: string } }>(
    "/servers/:serverId/sftp/reset-password",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const access = sftpRepo.getSftpAccessByServerId(server.id);
      if (!access) {
        reply.status(404);
        return { error: "SFTP access not enabled for this server" };
      }

      // Generate new password
      const password = generateServerPassword(16);
      const passwordHash = hashPassword(password);

      // Store the password temporarily in server config for the job to use
      const currentConfig = server.config as Record<string, string | number | boolean>;
      serversRepo.updateServer(server.id, {
        config: {
          ...currentConfig,
          _sftpPassword: password,
        },
      });

      // Update password hash in database
      sftpRepo.updateSftpPasswordHash(server.id, passwordHash);

      // Queue reset-sftp-password job
      const job = jobsRepo.createJob({
        serverId: server.id,
        action: "reset-sftp-password",
      });

      const hostConfig = getHostConfig();

      const credentials: SftpCredentials = {
        host: hostConfig.external,
        port: access.port,
        username: access.username,
        password,
        path: "/serverfiles",
      };

      return { credentials, job };
    }
  );
}
