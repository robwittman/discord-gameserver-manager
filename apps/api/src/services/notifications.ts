import type { Job } from "@discord-server-manager/shared";
import { serversRepo } from "../db/index.js";

const DISCORD_BOT_WEBHOOK_URL = process.env.DISCORD_BOT_WEBHOOK_URL;

export interface JobNotification {
  jobId: string;
  serverId: string;
  serverName: string;
  action: string;
  status: "completed" | "failed";
  error?: string;
  channelId: string;
  userId?: string;
}

/**
 * Send a notification to the Discord bot about a completed job
 */
export async function notifyJobComplete(job: Job): Promise<void> {
  if (!job.notifyChannelId) {
    // No channel to notify
    return;
  }

  if (!DISCORD_BOT_WEBHOOK_URL) {
    console.warn("DISCORD_BOT_WEBHOOK_URL not configured, skipping notification");
    return;
  }

  const server = serversRepo.getServerById(job.serverId);
  if (!server) {
    console.error(`Cannot send notification: server ${job.serverId} not found`);
    return;
  }

  const notification: JobNotification = {
    jobId: job.id,
    serverId: job.serverId,
    serverName: server.name,
    action: job.action,
    status: job.error ? "failed" : "completed",
    error: job.error,
    channelId: job.notifyChannelId,
    userId: job.notifyUserId,
  };

  try {
    const response = await fetch(DISCORD_BOT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notification),
    });

    if (!response.ok) {
      console.error(`Failed to send notification: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error("Failed to send notification:", err);
  }
}
