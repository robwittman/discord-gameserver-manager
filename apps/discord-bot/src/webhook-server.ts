import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Client, TextChannel } from "discord.js";
import { EmbedBuilder, userMention } from "discord.js";

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
 * Start the webhook server to receive notifications from the API
 */
export function startWebhookServer(client: Client, port: number = 3001): void {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only accept POST requests to /webhook
    if (req.method !== "POST" || req.url !== "/webhook") {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    // Read the request body
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", async () => {
      try {
        const notification = JSON.parse(body) as JobNotification;
        await handleNotification(client, notification);
        res.writeHead(200);
        res.end("OK");
      } catch (err) {
        console.error("Failed to process webhook:", err);
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });
  });

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });
}

async function handleNotification(client: Client, notification: JobNotification): Promise<void> {
  const channel = await client.channels.fetch(notification.channelId);
  if (!channel || !channel.isTextBased()) {
    console.error(`Channel ${notification.channelId} not found or not text-based`);
    return;
  }

  const textChannel = channel as TextChannel;

  const isSuccess = notification.status === "completed";
  const actionVerb = getActionVerb(notification.action, isSuccess);

  const embed = new EmbedBuilder()
    .setTitle(`${isSuccess ? "✅" : "❌"} Server ${actionVerb}`)
    .setColor(isSuccess ? 0x00ff00 : 0xff0000)
    .addFields(
      { name: "Server", value: notification.serverName, inline: true },
      { name: "Action", value: notification.action, inline: true },
      { name: "Status", value: notification.status, inline: true }
    );

  if (notification.error) {
    embed.addFields({
      name: "Error",
      value: notification.error.slice(0, 1024), // Discord field limit
      inline: false,
    });
  }

  // Add helpful next steps based on action
  if (isSuccess && notification.action === "provision") {
    embed.addFields({
      name: "Next Steps",
      value: "Your server is ready! Use `/server start` to start it, or `/server info` to see connection details.",
      inline: false,
    });
  }

  embed.setTimestamp();

  // Mention the user if provided
  const content = notification.userId ? userMention(notification.userId) : undefined;

  await textChannel.send({ content, embeds: [embed] });
}

function getActionVerb(action: string, success: boolean): string {
  const verbs: Record<string, [string, string]> = {
    provision: ["Provisioned", "Provision Failed"],
    start: ["Started", "Start Failed"],
    stop: ["Stopped", "Stop Failed"],
    backup: ["Backed Up", "Backup Failed"],
    update: ["Updated", "Update Failed"],
    deprovision: ["Deprovisioned", "Deprovision Failed"],
  };

  const [successVerb, failVerb] = verbs[action] ?? ["Completed", "Failed"];
  return success ? successVerb : failVerb;
}
