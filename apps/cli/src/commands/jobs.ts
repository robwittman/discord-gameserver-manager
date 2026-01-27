import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../api/client.js";
import type { Job } from "@discord-server-manager/shared";

function formatJobStatus(status: string): string {
  switch (status) {
    case "completed":
      return chalk.green("✓ completed");
    case "failed":
      return chalk.red("✖ failed");
    case "running":
      return chalk.blue("◐ running");
    case "queued":
      return chalk.yellow("◌ queued");
    default:
      return status;
  }
}

function formatJob(job: Job, verbose = false): void {
  console.log();
  console.log(chalk.bold(`Job ${job.id}`));
  console.log(`  Server:  ${job.serverId}`);
  console.log(`  Action:  ${job.action}`);
  console.log(`  Status:  ${formatJobStatus(job.status)}`);

  if (job.startedAt) {
    console.log(`  Started: ${job.startedAt}`);
  }
  if (job.completedAt) {
    console.log(`  Ended:   ${job.completedAt}`);
  }
  if (job.error) {
    console.log(`  Error:   ${chalk.red(job.error)}`);
  }

  if (verbose && job.logs && job.logs.length > 0) {
    console.log(`\n  ${chalk.gray("Logs:")}`);
    for (const line of job.logs) {
      console.log(`    ${chalk.gray(line)}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerJobsCommand(program: Command): void {
  const jobs = program
    .command("jobs")
    .alias("j")
    .description("Manage jobs");

  // List jobs
  jobs
    .command("list")
    .alias("ls")
    .description("List jobs")
    .option("-s, --server <serverId>", "Filter by server ID")
    .option("-v, --verbose", "Show detailed information including logs")
    .action(async (options) => {
      try {
        const api = getApiClient();
        const jobList = await api.listJobs(options.server);

        if (jobList.length === 0) {
          console.log(chalk.yellow("No jobs found"));
          return;
        }

        console.log(chalk.bold(`\nJobs (${jobList.length}):`));
        for (const job of jobList) {
          formatJob(job, options.verbose);
        }
        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Get job info
  jobs
    .command("info <jobId>")
    .description("Get job details")
    .action(async (jobId) => {
      try {
        const api = getApiClient();
        const job = await api.getJob(jobId);

        if (!job) {
          console.error(chalk.red(`Job not found: ${jobId}`));
          process.exit(1);
        }

        formatJob(job, true);
        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Watch job progress
  jobs
    .command("watch <jobId>")
    .description("Watch job progress in real-time")
    .option("-i, --interval <ms>", "Poll interval in milliseconds", "2000")
    .action(async (jobId, options) => {
      try {
        const api = getApiClient();
        const interval = parseInt(options.interval, 10);
        let lastLogCount = 0;
        let lastStatus = "";

        console.log(chalk.blue(`Watching job ${jobId}...`));
        console.log(chalk.gray("Press Ctrl+C to stop\n"));

        while (true) {
          const job = await api.getJob(jobId);

          if (!job) {
            console.error(chalk.red(`Job not found: ${jobId}`));
            process.exit(1);
          }

          // Print new logs
          if (job.logs && job.logs.length > lastLogCount) {
            for (let i = lastLogCount; i < job.logs.length; i++) {
              console.log(chalk.gray(job.logs[i]));
            }
            lastLogCount = job.logs.length;
          }

          // Print status change
          if (job.status !== lastStatus) {
            if (lastStatus) {
              console.log();
              console.log(chalk.bold(`Status: ${formatJobStatus(job.status)}`));
            }
            lastStatus = job.status;
          }

          // Exit if job is done
          if (job.status === "completed") {
            console.log();
            console.log(chalk.green("✓ Job completed successfully"));
            break;
          }

          if (job.status === "failed") {
            console.log();
            console.log(chalk.red(`✖ Job failed: ${job.error || "Unknown error"}`));
            process.exit(1);
          }

          await sleep(interval);
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
