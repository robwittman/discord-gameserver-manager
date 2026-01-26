import type { FastifyInstance } from "fastify";
import { jobsRepo, serversRepo } from "../db/index.js";
import { CreateJobSchema } from "./schemas.js";
import { JobStatus, type ServerStatus } from "@discord-server-manager/shared";

export async function jobRoutes(fastify: FastifyInstance) {
  // Queue a job for a server
  fastify.post<{ Params: { serverId: string } }>(
    "/servers/:serverId/jobs",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const parseResult = CreateJobSchema.safeParse(request.body);
      if (!parseResult.success) {
        reply.status(400);
        return { error: "Invalid request body", details: parseResult.error.issues };
      }

      const { action } = parseResult.data;

      // Validate action based on current server status
      const validationError = validateJobAction(server.status, action);
      if (validationError) {
        reply.status(409);
        return { error: validationError };
      }

      // Check for existing pending/running jobs
      const existingJobs = jobsRepo.getJobsByServer(server.id);
      const activeJob = existingJobs.find(
        (j) => j.status === "queued" || j.status === "running"
      );
      if (activeJob) {
        reply.status(409);
        return {
          error: "Server already has an active job",
          details: { jobId: activeJob.id, action: activeJob.action, status: activeJob.status },
        };
      }

      // Create the job
      const job = jobsRepo.createJob({
        serverId: server.id,
        action,
      });

      // Update server status based on action
      const newStatus = getStatusForAction(action);
      if (newStatus) {
        serversRepo.updateServer(server.id, { status: newStatus });
      }

      reply.status(201);
      return { job };
    }
  );

  // List jobs for a server
  fastify.get<{ Params: { serverId: string } }>(
    "/servers/:serverId/jobs",
    async (request, reply) => {
      const server = serversRepo.getServerById(request.params.serverId);
      if (!server) {
        reply.status(404);
        return { error: "Server not found" };
      }

      const jobs = jobsRepo.getJobsByServer(server.id);
      return { jobs };
    }
  );

  // Get a specific job
  fastify.get<{ Params: { id: string } }>("/jobs/:id", async (request, reply) => {
    const job = jobsRepo.getJobById(request.params.id);
    if (!job) {
      reply.status(404);
      return { error: "Job not found" };
    }

    const server = serversRepo.getServerById(job.serverId);

    return {
      job,
      server: server
        ? {
            id: server.id,
            name: server.name,
            gameId: server.gameId,
            status: server.status,
          }
        : null,
    };
  });

  // List all jobs (with optional status filter)
  fastify.get<{ Querystring: { status?: string } }>("/jobs", async (request, reply) => {
    const { status } = request.query;

    if (status) {
      const validStatuses = ["queued", "running", "completed", "failed"];
      if (!validStatuses.includes(status)) {
        reply.status(400);
        return { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` };
      }
      const jobs = jobsRepo.getJobsByStatus(status as JobStatus);
      return { jobs };
    }

    // Return queued jobs by default (useful for job runner)
    const jobs = jobsRepo.getQueuedJobs(50);
    return { jobs };
  });
}

function validateJobAction(currentStatus: ServerStatus, action: string): string | null {
  switch (action) {
    case "provision":
      if (currentStatus !== "pending") {
        return `Cannot provision server in ${currentStatus} status. Must be pending.`;
      }
      break;
    case "start":
      if (currentStatus !== "stopped" && currentStatus !== "error") {
        return `Cannot start server in ${currentStatus} status. Must be stopped.`;
      }
      break;
    case "stop":
      if (currentStatus !== "running") {
        return `Cannot stop server in ${currentStatus} status. Must be running.`;
      }
      break;
    case "backup":
      if (currentStatus !== "running" && currentStatus !== "stopped") {
        return `Cannot backup server in ${currentStatus} status. Must be running or stopped.`;
      }
      break;
    case "update":
      if (currentStatus !== "stopped") {
        return `Cannot update server in ${currentStatus} status. Must be stopped.`;
      }
      break;
    case "deprovision":
      if (currentStatus === "running" || currentStatus === "provisioning") {
        return `Cannot deprovision server in ${currentStatus} status. Stop it first.`;
      }
      break;
  }
  return null;
}

function getStatusForAction(action: string): ServerStatus | null {
  switch (action) {
    case "provision":
      return "provisioning" as ServerStatus;
    case "deprovision":
      return "pending" as ServerStatus;
    default:
      return null;
  }
}
