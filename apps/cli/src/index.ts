#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "./api/client.js";
import { registerServersCommand } from "./commands/servers.js";
import { registerJobsCommand } from "./commands/jobs.js";
import { registerGamesCommand } from "./commands/games.js";
import { registerModsCommand } from "./commands/mods.js";
import { registerSftpCommand } from "./commands/sftp.js";

const program = new Command();

program
  .name("gsm")
  .description("CLI for managing game servers")
  .version("0.1.0")
  .option("--api-url <url>", "API URL", process.env.API_URL || "http://localhost:3000");

// Health check command
program
  .command("health")
  .description("Check API health")
  .action(async () => {
    try {
      const api = getApiClient();
      const result = await api.health();
      console.log(chalk.green("✓ API is healthy"));
      console.log(chalk.gray(`  Status: ${result.status}`));
    } catch (error) {
      console.error(chalk.red("✖ API is not reachable"));
      console.error(chalk.gray(`  ${error instanceof Error ? error.message : error}`));
      process.exit(1);
    }
  });

// Stats command
program
  .command("stats")
  .description("Show system statistics")
  .action(async () => {
    try {
      const api = getApiClient();
      const stats = await api.stats();
      console.log(chalk.bold("\nSystem Statistics:"));
      console.log(JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Register command groups
registerServersCommand(program);
registerJobsCommand(program);
registerGamesCommand(program);
registerModsCommand(program);
registerSftpCommand(program);

// Parse and handle global options
program.hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.apiUrl) {
    process.env.API_URL = opts.apiUrl;
  }
});

// Error handling
program.exitOverride((err) => {
  if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
    process.exit(0);
  }
  process.exit(1);
});

program.parse();
