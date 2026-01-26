import { Collection, REST, Routes, SlashCommandBuilder } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import * as serverCommand from "./server.js";

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands = new Collection<string, Command>();

// Register all commands
commands.set(serverCommand.data.name, serverCommand as Command);

/**
 * Deploy slash commands to Discord
 */
export async function deployCommands(clientId: string, guildId?: string) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    throw new Error("DISCORD_TOKEN environment variable is required");
  }

  const rest = new REST().setToken(token);

  const commandData = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());

  console.log(`Deploying ${commandData.length} command(s)...`);

  if (guildId) {
    // Deploy to a specific guild (faster for development)
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commandData,
    });
    console.log(`Commands deployed to guild ${guildId}`);
  } else {
    // Deploy globally (takes up to an hour to propagate)
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    });
    console.log("Commands deployed globally");
  }
}
