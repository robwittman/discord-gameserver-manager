import { jobsRepo, serversRepo } from "../db/index.js";
import { executeJob, updateServerStatusAfterJob } from "./job-executor.js";
import { findAvailableGamePorts, createPortAllocations } from "./port-allocator.js";
import { getGameDefinition } from "../config/games.js";
import { notifyJobComplete } from "./notifications.js";
import { ServerStatus, type Job } from "@discord-server-manager/shared";

interface JobRunnerOptions {
  pollIntervalMs?: number;
  portRetryIntervalMs?: number;
  maxConcurrentJobs?: number;
}

const DEFAULT_OPTIONS: Required<JobRunnerOptions> = {
  pollIntervalMs: 5000,
  portRetryIntervalMs: 30000,
  maxConcurrentJobs: 3,
};

export class JobRunner {
  private options: Required<JobRunnerOptions>;
  private running = false;
  private activeJobs = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private portRetryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: JobRunnerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start the job runner
   */
  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    console.log("Job runner started");

    // Start polling for jobs
    this.pollTimer = setInterval(() => {
      this.pollAndProcessJobs().catch((err) => {
        console.error("Error polling jobs:", err);
      });
    }, this.options.pollIntervalMs);

    // Start port allocation retry
    this.portRetryTimer = setInterval(() => {
      this.retryPortAllocations().catch((err) => {
        console.error("Error retrying port allocations:", err);
      });
    }, this.options.portRetryIntervalMs);

    // Run immediately on start
    this.pollAndProcessJobs().catch(console.error);
    this.retryPortAllocations().catch(console.error);
  }

  /**
   * Stop the job runner gracefully
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log("Stopping job runner...");
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.portRetryTimer) {
      clearInterval(this.portRetryTimer);
      this.portRetryTimer = null;
    }

    // Wait for active jobs to complete
    if (this.activeJobs.size > 0) {
      console.log(`Waiting for ${this.activeJobs.size} active job(s) to complete...`);
      while (this.activeJobs.size > 0) {
        await sleep(500);
      }
    }

    console.log("Job runner stopped");
  }

  /**
   * Poll for queued jobs and process them
   */
  private async pollAndProcessJobs(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Check if we can take more jobs
    const availableSlots = this.options.maxConcurrentJobs - this.activeJobs.size;
    if (availableSlots <= 0) {
      return;
    }

    // Get queued jobs
    const queuedJobs = jobsRepo.getQueuedJobs(availableSlots);

    for (const job of queuedJobs) {
      if (!this.running) {
        break;
      }

      // Skip if already processing
      if (this.activeJobs.has(job.id)) {
        continue;
      }

      // Process job in background
      this.processJob(job).catch((err) => {
        console.error(`Error processing job ${job.id}:`, err);
      });
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    this.activeJobs.add(job.id);

    try {
      // Mark job as running
      const startedJob = jobsRepo.startJob(job.id);
      if (!startedJob) {
        console.log(`Job ${job.id} already started by another runner`);
        return;
      }

      console.log(`Processing job ${job.id}: ${job.action} for server ${job.serverId}`);

      // Execute the job
      const result = await executeJob(job);

      // Complete the job
      const completedJob = jobsRepo.completeJob(job.id, result.success ? undefined : result.error);

      // Update server status
      updateServerStatusAfterJob(job.serverId, job.action, result.success);

      console.log(
        `Job ${job.id} completed: ${result.success ? "success" : "failed"}${
          result.error ? ` - ${result.error}` : ""
        }`
      );

      // Send notification if configured
      if (completedJob) {
        notifyJobComplete(completedJob).catch((err) => {
          console.error(`Failed to send job notification for ${job.id}:`, err);
        });
      }
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Retry port allocations for servers in pending_ports status
   */
  private async retryPortAllocations(): Promise<void> {
    if (!this.running) {
      return;
    }

    const pendingServers = serversRepo.getServersByStatus(ServerStatus.PendingPorts);

    for (const server of pendingServers) {
      if (!this.running) {
        break;
      }

      const game = getGameDefinition(server.gameId);
      if (!game) {
        console.error(`Game definition not found for server ${server.id}`);
        continue;
      }

      try {
        console.log(`Retrying port allocation for server ${server.id}`);

        const allocatedPorts = findAvailableGamePorts(game.ports);
        createPortAllocations(server.id, allocatedPorts);
        serversRepo.updateServerPorts(server.id, allocatedPorts);

        console.log(`Port allocation succeeded for server ${server.id}: ${JSON.stringify(allocatedPorts)}`);
      } catch (err) {
        // Still no ports available, will retry later
        console.log(`Port allocation still pending for server ${server.id}: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Get runner status
   */
  getStatus(): { running: boolean; activeJobs: number; activeJobIds: string[] } {
    return {
      running: this.running,
      activeJobs: this.activeJobs.size,
      activeJobIds: Array.from(this.activeJobs),
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Singleton instance
let runnerInstance: JobRunner | null = null;

/**
 * Get the job runner instance
 */
export function getJobRunner(): JobRunner {
  if (!runnerInstance) {
    runnerInstance = new JobRunner();
  }
  return runnerInstance;
}

/**
 * Start the job runner
 */
export function startJobRunner(options?: JobRunnerOptions): JobRunner {
  if (runnerInstance) {
    runnerInstance.stop();
  }
  runnerInstance = new JobRunner(options);
  runnerInstance.start();
  return runnerInstance;
}

/**
 * Stop the job runner
 */
export async function stopJobRunner(): Promise<void> {
  if (runnerInstance) {
    await runnerInstance.stop();
    runnerInstance = null;
  }
}
