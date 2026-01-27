import { Client, GatewayIntentBits, Events } from "discord.js";
import "dotenv/config";
import { commands, deployCommands } from "./commands/index.js";
import { startWebhookServer } from "./webhook-server.js";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Discord bot ready! Logged in as ${readyClient.user.tag}`);

  // Deploy commands if DEPLOY_COMMANDS is set
  if (process.env.DEPLOY_COMMANDS === "true") {
    try {
      await deployCommands(
        readyClient.user.id,
        process.env.DEPLOY_GUILD_ID // Optional: deploy to specific guild for faster testing
      );
    } catch (error) {
      console.error("Failed to deploy commands:", error);
    }
  }

  // Start webhook server for receiving job notifications from the API
  const webhookPort = parseInt(process.env.WEBHOOK_PORT ?? "3001", 10);
  startWebhookServer(client, webhookPort);
});

// Handle slash command interactions
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);

  if (!command) {
    console.error(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);

    const errorMessage = "There was an error executing this command.";

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
});

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("DISCORD_TOKEN environment variable is required");
  process.exit(1);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  client.destroy();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  client.destroy();
  process.exit(0);
});

client.login(token);
