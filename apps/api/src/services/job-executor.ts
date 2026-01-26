import { serversRepo, jobsRepo } from "../db/index.js";
import { getGameDefinition } from "../config/games.js";
import { getHostConfig } from "../config/ports.js";
import { isProxmoxConfigured, getProxmoxConfig } from "../config/proxmox.js";
import { runPlaybook, type AnsibleVariables } from "./ansible.js";
import { getVmProvisioner } from "./proxmox.js";
import { ServerStatus, type Job, type ServerInstance, type GameDefinition } from "@discord-server-manager/shared";

export interface ExecutionResult {
  success: boolean;
  error?: string;
  logs: string[];
}

export interface JobContext {
  job: Job;
  server: ServerInstance;
  game: GameDefinition;
  log: (message: string) => void;
}

type ActionHandler = (ctx: JobContext) => Promise<ExecutionResult>;

const actionHandlers: Record<string, ActionHandler> = {
  provision: handleProvision,
  start: handleStart,
  stop: handleStop,
  backup: handleBackup,
  update: handleUpdate,
  deprovision: handleDeprovision,
};

/**
 * Execute a job and return the result
 */
export async function executeJob(job: Job): Promise<ExecutionResult> {
  const server = serversRepo.getServerById(job.serverId);
  if (!server) {
    return {
      success: false,
      error: "Server not found",
      logs: [],
    };
  }

  const game = getGameDefinition(server.gameId);
  if (!game) {
    return {
      success: false,
      error: `Game definition not found: ${server.gameId}`,
      logs: [],
    };
  }

  const logs: string[] = [];
  const log = (message: string) => {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${message}`;
    logs.push(entry);
    jobsRepo.appendJobLog(job.id, entry);
  };

  const handler = actionHandlers[job.action];
  if (!handler) {
    return {
      success: false,
      error: `Unknown action: ${job.action}`,
      logs,
    };
  }

  const ctx: JobContext = { job, server, game, log };

  try {
    log(`Starting ${job.action} for server ${server.name}`);
    const result = await handler(ctx);
    log(`Completed ${job.action}: ${result.success ? "success" : "failed"}`);
    return {
      ...result,
      logs: [...logs, ...result.logs],
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log(`Error during ${job.action}: ${error}`);
    return {
      success: false,
      error,
      logs,
    };
  }
}

/**
 * Update server status after job completion
 */
export function updateServerStatusAfterJob(
  serverId: string,
  action: string,
  success: boolean
): void {
  let newStatus: ServerStatus;

  if (!success) {
    newStatus = ServerStatus.Error;
  } else {
    switch (action) {
      case "provision":
        newStatus = ServerStatus.Stopped;
        break;
      case "start":
        newStatus = ServerStatus.Running;
        break;
      case "stop":
        newStatus = ServerStatus.Stopped;
        break;
      case "deprovision":
        newStatus = ServerStatus.Pending;
        break;
      default:
        // backup, update don't change status
        return;
    }
  }

  serversRepo.updateServer(serverId, { status: newStatus });
}

/**
 * Build Ansible variables from server context
 */
function buildAnsibleVars(ctx: JobContext): AnsibleVariables {
  const hostConfig = getHostConfig();

  return {
    server_id: ctx.server.id,
    server_name: ctx.server.name,
    game_id: ctx.server.gameId,
    // LGSM server name for generic LGSM playbooks (e.g., "vhserver" for Valheim)
    lgsm_server_name: ctx.game.lgsmServerName,
    ports: ctx.server.allocatedPorts,
    config: ctx.server.config,
    internal_address: ctx.server.internalAddress,
    external_address: hostConfig.external,
    owner_id: ctx.server.ownerId,
    guild_id: ctx.server.guildId,
  };
}

/**
 * Run an Ansible playbook with logging
 */
async function runPlaybookWithLogging(
  playbookPath: string,
  ctx: JobContext,
  extraVars?: Record<string, unknown>
): Promise<ExecutionResult> {
  const { log, server } = ctx;

  log(`Running playbook: ${playbookPath}`);

  const vars = buildAnsibleVars(ctx);
  const result = await runPlaybook(playbookPath, vars, {
    extraVars,
    // Use server's internal address for dynamic targeting
    targetHost: server.internalAddress,
    targetUser: "gameserver",
    onOutput: (line) => {
      // Only log non-empty, non-redundant lines
      if (line.trim() && !line.startsWith("PLAY RECAP")) {
        log(line);
      }
    },
  });

  if (!result.success) {
    log(`Playbook failed: ${result.error ?? "Unknown error"}`);
    if (result.stderr.length > 0) {
      log(`Stderr: ${result.stderr.slice(-5).join("\n")}`);
    }
  }

  return {
    success: result.success,
    error: result.error,
    logs: [],
  };
}

// Action Handlers

async function handleProvision(ctx: JobContext): Promise<ExecutionResult> {
  const { game, server, log } = ctx;

  log(`Game: ${game.name}`);
  log(`Allocated ports: ${JSON.stringify(server.allocatedPorts)}`);

  // Check if we need to provision a VM first
  if (!server.internalAddress && isProxmoxConfigured()) {
    log("No internal address set, provisioning VM via Proxmox...");

    try {
      const provisioner = getVmProvisioner();
      const config = getProxmoxConfig();
      const { vmId, ipAddress } = await provisioner.provisionVm(
        server.gameId,
        server.id,
        server.name
      );

      log(`VM provisioned: ID=${vmId}, IP=${ipAddress}`);

      // Update server with VM info
      serversRepo.updateServer(server.id, {
        internalAddress: ipAddress,
        vmId: vmId,
        vmNode: config.defaultNode,
      });

      // Update our context with the new address
      ctx.server = { ...server, internalAddress: ipAddress, vmId, vmNode: config.defaultNode };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Failed to provision VM: ${error}`);
      return { success: false, error: `VM provisioning failed: ${error}`, logs: [] };
    }
  } else if (!server.internalAddress) {
    log("No internal address set and Proxmox not configured");
    return {
      success: false,
      error: "Server has no internal address and Proxmox is not configured",
      logs: [],
    };
  }

  // Run the game-specific provisioning playbook
  return runPlaybookWithLogging(game.playbooks.provision, ctx);
}

async function handleStart(ctx: JobContext): Promise<ExecutionResult> {
  const { game } = ctx;
  return runPlaybookWithLogging(game.playbooks.start, ctx);
}

async function handleStop(ctx: JobContext): Promise<ExecutionResult> {
  const { game } = ctx;
  return runPlaybookWithLogging(game.playbooks.stop, ctx);
}

async function handleBackup(ctx: JobContext): Promise<ExecutionResult> {
  const { game, log } = ctx;

  const backupName = `backup-${Date.now()}`;
  log(`Creating backup: ${backupName}`);

  return runPlaybookWithLogging(game.playbooks.backup, ctx, {
    backup_name: backupName,
  });
}

async function handleUpdate(ctx: JobContext): Promise<ExecutionResult> {
  const { game, log } = ctx;

  if (!game.playbooks.update) {
    return { success: false, error: "No update playbook configured", logs: [] };
  }

  log("Updating game server...");

  return runPlaybookWithLogging(game.playbooks.update, ctx);
}

async function handleDeprovision(ctx: JobContext): Promise<ExecutionResult> {
  const { game, server, log } = ctx;

  // Run game-specific deprovision playbook if configured
  if (game.playbooks.deprovision && server.internalAddress) {
    log("Running deprovision playbook...");
    const result = await runPlaybookWithLogging(game.playbooks.deprovision, ctx);
    if (!result.success) {
      log(`Deprovision playbook failed: ${result.error}`);
      // Continue with VM destruction anyway
    }
  }

  // Destroy the VM if it was provisioned via Proxmox
  if (server.vmId && isProxmoxConfigured()) {
    log(`Destroying VM ${server.vmId}...`);
    try {
      const provisioner = getVmProvisioner();
      await provisioner.destroyVm(server.vmId, server.vmNode);
      log(`VM ${server.vmId} destroyed`);

      // Clear VM info from server
      serversRepo.updateServer(server.id, {
        internalAddress: undefined,
        vmId: undefined,
        vmNode: undefined,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Failed to destroy VM: ${error}`);
      return { success: false, error: `VM destruction failed: ${error}`, logs: [] };
    }
  }

  log("Deprovision complete");
  return { success: true, logs: [] };
}
