import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../api/client.js";
import { watchJob } from "./jobs.js";
import type { ServerInstance } from "@discord-server-manager/shared";

function formatStatus(status: string): string {
  switch (status) {
    case "running":
      return chalk.green("● running");
    case "stopped":
      return chalk.yellow("○ stopped");
    case "provisioning":
      return chalk.blue("◐ provisioning");
    case "pending":
      return chalk.gray("◌ pending");
    case "deleting":
      return chalk.magenta("◐ deleting");
    case "error":
      return chalk.red("✖ error");
    default:
      return status;
  }
}

function formatServer(server: ServerInstance, verbose = false): void {
  console.log();
  console.log(chalk.bold(server.name), chalk.gray(`(${server.id})`));
  console.log(`  Game:    ${server.gameId}`);
  console.log(`  Status:  ${formatStatus(server.status)}`);
  console.log(`  Owner:   ${server.ownerId}`);

  if (server.internalAddress) {
    console.log(`  Address: ${server.internalAddress}`);
  }

  if (server.allocatedPorts && Object.keys(server.allocatedPorts).length > 0) {
    const ports = Object.entries(server.allocatedPorts)
      .map(([name, port]) => `${name}:${port}`)
      .join(", ");
    console.log(`  Ports:   ${ports}`);
  }

  if (verbose) {
    console.log(`  Guild:   ${server.guildId}`);
    console.log(`  Created: ${server.createdAt}`);
    if (server.vmId) {
      console.log(`  VM ID:   ${server.vmId} (${server.vmNode})`);
    }
    if (server.config && Object.keys(server.config).length > 0) {
      console.log(`  Config:`);
      for (const [key, value] of Object.entries(server.config)) {
        if (!key.startsWith("_")) {
          console.log(`    ${key}: ${value}`);
        }
      }
    }
  }
}

export function registerServersCommand(program: Command): void {
  const servers = program
    .command("servers")
    .alias("s")
    .description("Manage game servers");

  // List servers
  servers
    .command("list")
    .alias("ls")
    .description("List all servers")
    .option("-v, --verbose", "Show detailed information")
    .action(async (options) => {
      try {
        const api = getApiClient();
        const serverList = await api.listServers();

        if (serverList.length === 0) {
          console.log(chalk.yellow("No servers found"));
          return;
        }

        console.log(chalk.bold(`\nServers (${serverList.length}):`));
        for (const server of serverList) {
          formatServer(server, options.verbose);
        }
        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Get server info
  servers
    .command("info <serverId>")
    .description("Get detailed server information")
    .action(async (serverId) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        formatServer(server, true);
        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Create server
  servers
    .command("create <gameId> <name>")
    .description("Create a new server")
    .option("-o, --owner <ownerId>", "Owner ID", "cli-user")
    .option("-g, --guild <guildId>", "Guild ID", "cli-guild")
    .option("-c, --config <json>", "Server config as JSON")
    .action(async (gameId, name, options) => {
      try {
        const api = getApiClient();

        // Check if game exists
        const game = await api.getGame(gameId);
        if (!game) {
          console.error(chalk.red(`Game not found: ${gameId}`));
          const games = await api.listGames();
          console.log(chalk.yellow("\nAvailable games:"));
          for (const g of games) {
            console.log(`  - ${g.id} (${g.name})`);
          }
          process.exit(1);
        }

        let config: Record<string, unknown> = { serverName: name };
        if (options.config) {
          try {
            config = { ...config, ...JSON.parse(options.config) };
          } catch {
            console.error(chalk.red("Invalid JSON config"));
            process.exit(1);
          }
        }

        console.log(chalk.blue(`Creating ${game.name} server "${name}"...`));

        const result = await api.createServer({
          gameId,
          name,
          config,
          ownerId: options.owner,
          guildId: options.guild,
        });

        console.log(chalk.green("\n✓ Server created"));
        formatServer(result.server, true);

        if (result.job) {
          console.log(chalk.blue(`\nProvisioning job queued: ${result.job.id}`));
          console.log(chalk.gray("Run 'gsm jobs watch " + result.job.id + "' to monitor progress"));
        }

        if (result.portAllocationFailed) {
          console.log(chalk.yellow("\n⚠ Port allocation failed - no ports available"));
        }

        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Delete server
  servers
    .command("delete <serverId>")
    .description("Delete a server (only owner can delete)")
    .option("-f, --force", "Skip confirmation")
    .option("-w, --watch", "Watch job progress after queuing")
    .requiredOption("-u, --user-id <userId>", "User ID of the server owner (required for authorization)")
    .action(async (serverId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        if (!options.force) {
          console.log(chalk.yellow(`\nAbout to delete server: ${server.name} (${server.id})`));
          console.log(chalk.yellow("This action cannot be undone."));
          console.log(chalk.gray("\nRun with --force to skip this confirmation"));
          process.exit(0);
        }

        console.log(chalk.blue(`Deleting server "${server.name}"...`));
        const result = await api.deleteServer(serverId, options.userId);
        console.log(chalk.green(`✓ Server deletion queued (job: ${result.job.id})`));

        if (options.watch) {
          const success = await watchJob(result.job.id);
          if (!success) {
            process.exit(1);
          }
        } else {
          console.log(chalk.gray(`Run 'gsm jobs watch ${result.job.id}' to monitor progress`));
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Server actions (start, stop, etc.)
  const actions = ["start", "stop", "provision", "backup", "update", "deprovision"];

  for (const action of actions) {
    servers
      .command(`${action} <serverId>`)
      .description(`${action.charAt(0).toUpperCase() + action.slice(1)} a server`)
      .option("-w, --watch", "Watch job progress after queuing")
      .action(async (serverId, options) => {
        try {
          const api = getApiClient();
          const server = await api.getServer(serverId);

          if (!server) {
            console.error(chalk.red(`Server not found: ${serverId}`));
            process.exit(1);
          }

          console.log(chalk.blue(`Queueing ${action} job for "${server.name}"...`));
          const job = await api.createJob(serverId, action);

          console.log(chalk.green(`✓ Job queued: ${job.id}`));

          if (options.watch) {
            const success = await watchJob(job.id);
            if (!success) {
              process.exit(1);
            }
          } else {
            console.log(chalk.gray(`Run 'gsm jobs watch ${job.id}' to monitor progress`));
            console.log();
          }
        } catch (error) {
          console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
          process.exit(1);
        }
      });
  }
}
