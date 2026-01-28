import { Command } from "commander";
import chalk from "chalk";
import { getApiClient } from "../api/client.js";
import { watchJob } from "./jobs.js";

export function registerSftpCommand(program: Command): void {
  const sftp = program
    .command("sftp")
    .description("Manage SFTP access for game servers");

  // Enable SFTP
  sftp
    .command("enable <serverId>")
    .description("Enable SFTP access for a server")
    .option("-u, --user-id <userId>", "User ID to associate with access")
    .option("-w, --watch", "Watch job progress after queuing")
    .action(async (serverId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        console.log(chalk.blue(`Enabling SFTP access for "${server.name}"...`));
        const result = await api.enableSftp(serverId, options.userId);

        console.log(chalk.green("\n✓ SFTP access enabled"));
        console.log();
        console.log(chalk.bold("Connection Details:"));
        console.log(`  Host:     ${result.credentials.host}`);
        console.log(`  Port:     ${result.credentials.port}`);
        console.log(`  Username: ${result.credentials.username}`);
        console.log(`  Password: ${chalk.yellow(result.credentials.password)}`);
        console.log(`  Path:     ${result.credentials.path}`);
        console.log();
        console.log(chalk.gray("Connect using:"));
        console.log(chalk.cyan(`  sftp -P ${result.credentials.port} ${result.credentials.username}@${result.credentials.host}`));
        console.log();
        console.log(chalk.yellow("Note: Save the password now - it won't be shown again."));

        if (options.watch && result.job) {
          console.log();
          const success = await watchJob(result.job.id);
          if (!success) {
            process.exit(1);
          }
        } else if (result.job) {
          console.log(chalk.gray(`Job queued: ${result.job.id}`));
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Get SFTP info
  sftp
    .command("info <serverId>")
    .description("Get SFTP connection info for a server (no password)")
    .action(async (serverId) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        const info = await api.getSftpInfo(serverId);

        if (!info) {
          console.log(chalk.yellow(`SFTP access not enabled for "${server.name}"`));
          console.log(chalk.gray(`Run 'gsm sftp enable ${serverId}' to enable`));
          return;
        }

        console.log(chalk.bold(`\nSFTP Access: ${server.name}`));
        console.log();
        console.log(`  Host:     ${info.host}`);
        console.log(`  Port:     ${info.port}`);
        console.log(`  Username: ${info.username}`);
        console.log(`  Path:     ${info.path}`);
        console.log(`  Enabled:  ${info.createdAt}`);
        console.log();
        console.log(chalk.gray("Connect using:"));
        console.log(chalk.cyan(`  sftp -P ${info.port} ${info.username}@${info.host}`));
        console.log();
        console.log(chalk.gray("Forgot password? Run 'gsm sftp reset-password " + serverId + "'"));
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Disable SFTP
  sftp
    .command("disable <serverId>")
    .description("Disable SFTP access for a server")
    .option("-w, --watch", "Watch job progress after queuing")
    .action(async (serverId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        console.log(chalk.blue(`Disabling SFTP access for "${server.name}"...`));
        const result = await api.disableSftp(serverId);

        console.log(chalk.green("✓ SFTP access disable queued"));

        if (options.watch && result.job) {
          const success = await watchJob(result.job.id);
          if (!success) {
            process.exit(1);
          }
        } else if (result.job) {
          console.log(chalk.gray(`Job queued: ${result.job.id}`));
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });

  // Reset SFTP password
  sftp
    .command("reset-password <serverId>")
    .description("Regenerate SFTP password for a server")
    .option("-w, --watch", "Watch job progress after queuing")
    .action(async (serverId, options) => {
      try {
        const api = getApiClient();
        const server = await api.getServer(serverId);

        if (!server) {
          console.error(chalk.red(`Server not found: ${serverId}`));
          process.exit(1);
        }

        console.log(chalk.blue(`Resetting SFTP password for "${server.name}"...`));
        const result = await api.resetSftpPassword(serverId);

        console.log(chalk.green("\n✓ SFTP password reset"));
        console.log();
        console.log(chalk.bold("New Connection Details:"));
        console.log(`  Host:     ${result.credentials.host}`);
        console.log(`  Port:     ${result.credentials.port}`);
        console.log(`  Username: ${result.credentials.username}`);
        console.log(`  Password: ${chalk.yellow(result.credentials.password)}`);
        console.log(`  Path:     ${result.credentials.path}`);
        console.log();
        console.log(chalk.yellow("Note: Save the password now - it won't be shown again."));

        if (options.watch && result.job) {
          console.log();
          const success = await watchJob(result.job.id);
          if (!success) {
            process.exit(1);
          }
        } else if (result.job) {
          console.log(chalk.gray(`Job queued: ${result.job.id}`));
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
