import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../api/client.js";
import { watchJob } from "./jobs.js";
import type { ModEntry } from "@discord-server-manager/shared";

function formatMod(mod: ModEntry, index: number): void {
  const status = mod.enabled ? chalk.green("enabled") : chalk.yellow("disabled");
  const version = mod.version ? chalk.gray(`@${mod.version}`) : chalk.gray("@latest");
  const name = mod.name ? `${mod.name} ` : "";

  console.log(`  ${index + 1}. ${name}${chalk.bold(mod.id)}${version}`);
  console.log(`     Source: ${mod.source} | Status: ${status}`);
}

export function registerModsCommand(program: Command): void {
  const mods = program
    .command("mods")
    .alias("m")
    .description("Manage server mods");

  // List mods for a server
  mods
    .command("list <serverId>")
    .alias("ls")
    .description("List mods installed on a server")
    .action(async (serverId) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        const result = await api.getServerMods(serverId);

        console.log();
        console.log(chalk.bold(`Mods for ${server.name}`));

        if (result.modsConfig) {
          console.log(chalk.gray(`Game: ${server.gameId}`));
          console.log(chalk.gray(`Source: ${result.modsConfig.source}`));
          console.log(chalk.gray(`Install path: ${result.modsConfig.installPath}`));
          if (result.modsConfig.framework) {
            console.log(chalk.gray(`Framework: ${result.modsConfig.framework.name}`));
          }
          if (result.modsConfig.repositoryUrl) {
            console.log(chalk.gray(`Repository: ${result.modsConfig.repositoryUrl}`));
          }
        }

        console.log();

        if (result.mods.length === 0) {
          console.log(chalk.yellow("No mods installed"));
          console.log(chalk.gray("\nUse 'gsm mods add <serverId> <modId>' to add a mod"));
        } else {
          console.log(`${result.mods.length} mod(s) installed:\n`);
          result.mods.forEach((mod, i) => formatMod(mod, i));
        }

        console.log();
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Add a mod to a server
  mods
    .command("add <serverId> <modId>")
    .description("Add a mod to a server")
    .option("-s, --source <source>", "Mod source (uses game default if not specified)")
    .option("-v, --version <version>", "Mod version (uses latest if not specified)")
    .option("-n, --name <name>", "Display name for the mod")
    .option("--disabled", "Add mod in disabled state")
    .action(async (serverId, modId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        console.log(chalk.blue(`Adding mod "${modId}" to ${server.name}...`));

        const result = await api.addServerMod(serverId, {
          id: modId,
          source: options.source,
          version: options.version,
          name: options.name,
          enabled: !options.disabled,
        });

        console.log(chalk.green(`\n✓ Mod added successfully`));
        console.log();
        formatMod(result.mod, 0);
        console.log();
        console.log(chalk.gray(`Total mods: ${result.mods.length}`));
        console.log(chalk.gray("\nNote: Run the install-mods job to download and install mods on the server"));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Remove a mod from a server
  mods
    .command("remove <serverId> <modId>")
    .alias("rm")
    .description("Remove a mod from a server")
    .option("-s, --source <source>", "Mod source (to disambiguate if same mod ID from multiple sources)")
    .action(async (serverId, modId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        console.log(chalk.blue(`Removing mod "${modId}" from ${server.name}...`));

        const result = await api.removeServerMod(serverId, modId, options.source);

        console.log(chalk.green(`\n✓ Mod removed: ${result.removed.id}`));
        console.log(chalk.gray(`Remaining mods: ${result.mods.length}`));
        console.log(chalk.gray("\nNote: Run the install-mods job to update mods on the server"));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Enable a mod
  mods
    .command("enable <serverId> <modId>")
    .description("Enable a mod on a server")
    .option("-s, --source <source>", "Mod source")
    .action(async (serverId, modId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        const result = await api.toggleServerMod(serverId, modId, {
          source: options.source,
          enabled: true,
        });

        console.log(chalk.green(`✓ Mod "${result.mod.id}" enabled`));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Disable a mod
  mods
    .command("disable <serverId> <modId>")
    .description("Disable a mod on a server")
    .option("-s, --source <source>", "Mod source")
    .action(async (serverId, modId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        const result = await api.toggleServerMod(serverId, modId, {
          source: options.source,
          enabled: false,
        });

        console.log(chalk.yellow(`✓ Mod "${result.mod.id}" disabled`));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Set mod version
  mods
    .command("set-version <serverId> <modId> <version>")
    .description("Set a specific version for a mod")
    .option("-s, --source <source>", "Mod source")
    .action(async (serverId, modId, version, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        const result = await api.toggleServerMod(serverId, modId, {
          source: options.source,
          version,
        });

        console.log(chalk.green(`✓ Mod "${result.mod.id}" version set to ${version}`));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Install mods on server
  mods
    .command("install <serverId>")
    .description("Run the install-mods job to download and install configured mods on the server")
    .option("-w, --watch", "Watch job progress in real-time")
    .action(async (serverId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        // Check if server has mods configured
        const { mods, modsConfig } = await api.getServerMods(serverId);

        if (!modsConfig?.enabled) {
          console.error(chalk.red(`Game ${server.gameId} does not support mods`));
          process.exit(1);
        }

        if (mods.length === 0) {
          console.log(chalk.yellow("No mods configured for this server"));
          console.log(chalk.gray("\nUse 'gsm mods add <serverId> <modId>' to add mods first"));
          return;
        }

        const enabledCount = mods.filter((m) => m.enabled).length;
        console.log(chalk.blue(`Installing mods on ${server.name}...`));
        console.log(chalk.gray(`Configured: ${mods.length} mods (${enabledCount} enabled)`));

        const job = await api.createJob(serverId, "install-mods");

        console.log(chalk.green(`\n✓ Install-mods job queued: ${job.id}`));

        if (options.watch) {
          const success = await watchJob(job.id);
          if (!success) {
            process.exit(1);
          }
        } else {
          console.log(chalk.gray(`\nTo watch progress: gsm jobs watch ${job.id}`));
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Clear all mods
  mods
    .command("clear <serverId>")
    .description("Remove all mods from a server")
    .option("-f, --force", "Skip confirmation")
    .action(async (serverId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        const current = await api.getServerMods(serverId);

        if (current.mods.length === 0) {
          console.log(chalk.yellow("No mods to remove"));
          return;
        }

        if (!options.force) {
          console.log(chalk.yellow(`\nAbout to remove ${current.mods.length} mod(s) from ${server.name}`));
          console.log(chalk.gray("Run with --force to confirm"));
          process.exit(0);
        }

        await api.setServerMods(serverId, []);
        console.log(chalk.green(`✓ Removed ${current.mods.length} mod(s)`));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
