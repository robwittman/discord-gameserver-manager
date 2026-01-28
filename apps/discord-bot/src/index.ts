import { Client, GatewayIntentBits, Events } from "discord.js";
import "dotenv/config";
import { commands, deployCommands } from "./commands/index.js";
import { startWebhookServer } from "./webhook-server.js";
import { handleModButtonInteraction, handleModModalInteraction } from "./interactions/index.js";

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

// Handle interactions (slash commands, buttons, modals)
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      await command.execute(interaction);
      return;
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const handled = await handleModButtonInteraction(interaction);
      if (!handled) {
        console.error(`Unhandled button interaction: ${interaction.customId}`);
      }
      return;
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      const handled = await handleModModalInteraction(interaction);
      if (!handled) {
        console.error(`Unhandled modal interaction: ${interaction.customId}`);
      }
      return;
    }
  } catch (error) {
    console.error("Error handling interaction:", error);

    const errorMessage = "There was an error processing this interaction.";

    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
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
