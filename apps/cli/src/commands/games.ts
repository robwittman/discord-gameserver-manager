import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../api/client.js";
import type { GameDefinition } from "@discord-server-manager/shared";

function formatGame(game: GameDefinition, verbose = false): void {
  console.log();
  console.log(chalk.bold(game.name), chalk.gray(`(${game.id})`));

  if (game.steamAppId) {
    console.log(`  Steam App ID: ${game.steamAppId}`);
  }

  if (game.ports && Object.keys(game.ports).length > 0) {
    const ports = Object.entries(game.ports)
      .map(([name, def]) => `${name}:${def.port}/${def.protocol}`)
      .join(", ");
    console.log(`  Ports: ${ports}`);
  }

  if (verbose) {
    if (game.resources) {
      console.log(`  Resources:`);
      console.log(`    Memory: ${game.resources.minMemoryMb}-${game.resources.recommendedMemoryMb}MB`);
      console.log(`    CPU: ${game.resources.minCpuCores} cores`);
      console.log(`    Disk: ${game.resources.diskSpaceGb}GB`);
    }

    if (game.configSchema && Object.keys(game.configSchema).length > 0) {
      console.log(`  Config options:`);
      for (const [key, schema] of Object.entries(game.configSchema)) {
        const required = schema.required ? chalk.red("*") : "";
        const defaultVal = schema.default !== undefined ? chalk.gray(` (default: ${schema.default})`) : "";
        console.log(`    ${key}${required}: ${schema.type}${defaultVal}`);
        if (schema.description) {
          console.log(`      ${chalk.gray(schema.description)}`);
        }
      }
    }
  }
}

export function registerGamesCommand(program: Command): void {
  const games = program
    .command("games")
    .alias("g")
    .description("List available games");

  // List games
  games
    .command("list")
    .alias("ls")
    .description("List all available games")
    .option("-v, --verbose", "Show detailed information")
    .action(async (options) => {
      try {
        const api = getApiClient();
        const gameList = await api.listGames();

        if (gameList.length === 0) {
          console.log(chalk.yellow("No games configured"));
          return;
        }

        console.log(chalk.bold(`\nAvailable Games (${gameList.length}):`));
        for (const game of gameList) {
          formatGame(game, options.verbose);
        }
        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Get game info
  games
    .command("info <gameId>")
    .description("Get detailed game information")
    .action(async (gameId) => {
      try {
        const api = getApiClient();
        const game = await api.getGame(gameId);

        if (!game) {
          console.error(chalk.red(`Game not found: ${gameId}`));
          const gameList = await api.listGames();
          console.log(chalk.yellow("\nAvailable games:"));
          for (const g of gameList) {
            console.log(`  - ${g.id} (${g.name})`);
          }
          process.exit(1);
        }

        formatGame(game, true);
        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
