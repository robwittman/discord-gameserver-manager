import { serversRepo, jobsRepo } from "../db/index.js";
import { getGameDefinition } from "../config/games.js";
import { getHostConfig } from "../config/ports.js";
import { isProxmoxConfigured, getProxmoxConfig } from "../config/proxmox.js";
import { runPlaybook, type AnsibleVariables } from "./ansible.js";
import { getVmProvisioner } from "./proxmox.js";
import { getUniFiClient, isUniFiConfigured } from "./unifi.js";
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

  // Use game's default ports for the server itself (not allocated external ports)
  const gamePorts: Record<string, number> = {};
  for (const [name, portDef] of Object.entries(ctx.game.ports)) {
    gamePorts[name] = portDef.port;
  }

  return {
    server_id: ctx.server.id,
    server_name: ctx.server.name,
    game_id: ctx.server.gameId,
    // LGSM server name for generic LGSM playbooks (e.g., "vhserver" for Valheim)
    lgsm_server_name: ctx.game.lgsmServerName,
    // Use game's default ports for the server config
    ports: gamePorts,
    // Pass allocated ports separately (for reference/port forwarding)
    external_ports: ctx.server.allocatedPorts,
    config: ctx.server.config,
    game_config: ctx.server.config, // Alias for templates
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
  log(`Allocated external ports: ${JSON.stringify(server.allocatedPorts)}`);

  // Log the internal ports that will be used
  const internalPorts: Record<string, number> = {};
  for (const [name, portDef] of Object.entries(game.ports)) {
    internalPorts[name] = portDef.port;
  }
  log(`Internal game ports: ${JSON.stringify(internalPorts)}`);

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

  // Create port forwarding rules on UniFi if configured
  if (isUniFiConfigured()) {
    log("Creating port forwarding rules on UniFi...");
    try {
      await createPortForwardingRules(ctx);
      log("Port forwarding rules created");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Warning: Failed to create port forwarding rules: ${error}`);
      // Don't fail provisioning if port forwarding fails - it can be set up manually
    }
  }

  // Run the game-specific provisioning playbook
  return runPlaybookWithLogging(game.playbooks.provision, ctx);
}

/**
 * Create port forwarding rules on UniFi for a server
 */
async function createPortForwardingRules(ctx: JobContext): Promise<void> {
  const { server, game, log } = ctx;
  const unifi = getUniFiClient();

  if (!unifi || !server.internalAddress) {
    return;
  }

  const portForwardRuleIds: string[] = [];

  for (const [portName, externalPort] of Object.entries(server.allocatedPorts)) {
    const portDef = game.ports[portName];
    if (!portDef) {
      log(`Warning: No port definition found for ${portName}`);
      continue;
    }

    const ruleName = `gs-${server.id.slice(0, 8)}-${portName}`;

    // Check if rule already exists
    const existing = await unifi.findPortForwardByName(ruleName);
    if (existing) {
      log(`Port forward rule already exists: ${ruleName}`);
      if (existing._id) {
        portForwardRuleIds.push(existing._id);
      }
      continue;
    }

    log(`Creating port forward: ${externalPort} -> ${server.internalAddress}:${portDef.port} (${portDef.protocol})`);

    const rule = await unifi.createPortForward({
      name: ruleName,
      externalPort,
      internalIp: server.internalAddress,
      internalPort: portDef.port,
      protocol: portDef.protocol === "tcp+udp" ? "tcp_udp" : portDef.protocol,
    });

    if (rule._id) {
      portForwardRuleIds.push(rule._id);
    }
  }

  // Store the rule IDs in the server's config for cleanup later (as JSON string)
  if (portForwardRuleIds.length > 0) {
    const currentConfig = server.config as Record<string, string | number | boolean>;
    serversRepo.updateServer(server.id, {
      config: {
        ...currentConfig,
        _portForwardRuleIds: JSON.stringify(portForwardRuleIds),
      },
    });
  }
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

  // Delete port forwarding rules if UniFi is configured
  if (isUniFiConfigured()) {
    log("Removing port forwarding rules...");
    try {
      await deletePortForwardingRules(ctx);
      log("Port forwarding rules removed");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Warning: Failed to remove port forwarding rules: ${error}`);
      // Don't fail deprovisioning if port forwarding cleanup fails
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

/**
 * Delete port forwarding rules on UniFi for a server
 */
async function deletePortForwardingRules(ctx: JobContext): Promise<void> {
  const { server, log } = ctx;
  const unifi = getUniFiClient();

  if (!unifi) {
    return;
  }

  // Get rule IDs from server config (stored as JSON string)
  const config = server.config as Record<string, unknown>;
  const ruleIdsJson = config._portForwardRuleIds as string | undefined;
  const ruleIds = ruleIdsJson ? JSON.parse(ruleIdsJson) as string[] : undefined;

  if (ruleIds && ruleIds.length > 0) {
    for (const ruleId of ruleIds) {
      try {
        await unifi.deletePortForward(ruleId);
        log(`Deleted port forward rule: ${ruleId}`);
      } catch (err) {
        log(`Warning: Failed to delete rule ${ruleId}: ${err instanceof Error ? err.message : err}`);
      }
    }
  } else {
    // Fallback: try to find rules by naming convention
    log("No stored rule IDs, searching by name pattern...");
    const rules = await unifi.listPortForwards();
    const prefix = `gs-${server.id.slice(0, 8)}-`;

    for (const rule of rules) {
      if (rule.name.startsWith(prefix) && rule._id) {
        try {
          await unifi.deletePortForward(rule._id);
          log(`Deleted port forward rule: ${rule.name}`);
        } catch (err) {
          log(`Warning: Failed to delete rule ${rule.name}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }
}
