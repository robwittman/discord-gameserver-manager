import Fastify from "fastify";
import "dotenv/config";
import { initializeDatabase, closeDatabase } from "./db/index.js";
import { getGameDefinitions, reloadGameDefinitions } from "./config/games.js";
import { getPortConfig, reloadPortConfig } from "./config/ports.js";
import { serverRoutes, jobRoutes, managerRoutes, modRoutes, sftpRoutes } from "./routes/index.js";
import { getPoolStats } from "./services/port-allocator.js";
import { startJobRunner, stopJobRunner, getJobRunner } from "./services/job-runner.js";

const fastify = Fastify({
  logger: true,
});

// Health check endpoint
fastify.get("/health", async () => {
  return { status: "ok" };
});

// System stats endpoint
fastify.get("/stats", async () => {
  const portStats = getPoolStats();
  const games = getGameDefinitions();
  const jobRunner = getJobRunner();
  return {
    games: games.size,
    ports: portStats,
    jobRunner: jobRunner.getStatus(),
  };
});

// List available games
fastify.get("/games", async () => {
  const games = Array.from(getGameDefinitions().values()).map((g) => ({
    id: g.id,
    name: g.name,
    steamAppId: g.steamAppId,
  }));
  return { games };
});

// Get game details
fastify.get<{ Params: { id: string } }>("/games/:id", async (request, reply) => {
  const game = getGameDefinitions().get(request.params.id);
  if (!game) {
    reply.status(404);
    return { error: "Game not found" };
  }
  return { game };
});

// Register route modules
fastify.register(serverRoutes);
fastify.register(jobRoutes);
fastify.register(managerRoutes);
fastify.register(modRoutes);
fastify.register(sftpRoutes);

const port = parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";

async function start() {
  try {
    // Initialize database
    initializeDatabase();

    // Load configurations
    getPortConfig();
    const games = getGameDefinitions();
    console.log(`Loaded ${games.size} game definition(s)`);

    // Start job runner
    const runJobRunner = process.env.DISABLE_JOB_RUNNER !== "true";
    if (runJobRunner) {
      startJobRunner({
        pollIntervalMs: parseInt(process.env.JOB_POLL_INTERVAL_MS ?? "5000", 10),
        portRetryIntervalMs: parseInt(process.env.PORT_RETRY_INTERVAL_MS ?? "30000", 10),
        maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS ?? "3", 10),
      });
    }

    // Handle SIGHUP for config reload
    process.on("SIGHUP", () => {
      console.log("Received SIGHUP, reloading configurations...");
      reloadGameDefinitions();
      reloadPortConfig();
      console.log(`Reloaded ${getGameDefinitions().size} game definition(s)`);
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("Shutting down...");
      await stopJobRunner();
      await fastify.close();
      closeDatabase();
      process.exit(0);
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    await fastify.listen({ port, host });
    console.log(`API server listening on ${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
