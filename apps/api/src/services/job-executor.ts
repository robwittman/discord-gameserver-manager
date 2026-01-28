import { serversRepo, jobsRepo, sftpRepo } from "../db/index.js";
import { getGameDefinition } from "../config/games.js";
import { getHostConfig } from "../config/ports.js";
import { isProxmoxConfigured, getProxmoxConfig } from "../config/proxmox.js";
import { runPlaybook, type AnsibleVariables } from "./ansible.js";
import { getVmProvisioner } from "./proxmox.js";
import { getUniFiClient, isUniFiConfigured } from "./unifi.js";
import { releasePorts } from "./port-allocator.js";
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
  delete: handleDelete,
  "install-mods": handleInstallMods,
  "setup-sftp": handleSetupSftp,
  "disable-sftp": handleDisableSftp,
  "reset-sftp-password": handleResetSftpPassword,
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
  // Skip status update for delete action - record is already soft-deleted
  if (action === "delete") {
    return;
  }

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

  // Use allocated ports for the server config
  // This ensures the game server listens on the same port that's externally exposed,
  // which is required for games that don't support port translation (e.g., Satisfactory)
  const ports = ctx.server.allocatedPorts;

  return {
    server_id: ctx.server.id,
    server_name: ctx.server.name,
    game_id: ctx.server.gameId,
    // LGSM server name for generic LGSM playbooks (e.g., "vhserver" for Valheim)
    lgsm_server_name: ctx.game.lgsmServerName,
    // Use allocated ports for the server config (game listens on these)
    ports: ports,
    // Alias for backwards compatibility
    external_ports: ctx.server.allocatedPorts,
    config: ctx.server.config,
    game_config: ctx.server.config, // Alias for templates
    internal_address: ctx.server.internalAddress,
    external_address: hostConfig.external,
    owner_id: ctx.server.ownerId,
    guild_id: ctx.server.guildId,
    // Mod support
    mods: ctx.server.mods ?? [],
    mods_config: ctx.game.modsConfig ?? null,
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
  log(`Game server will listen on these ports (no port translation)`);

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

    // Use the same port internally and externally (required for games that don't support port translation)
    log(`Creating port forward: ${externalPort} -> ${server.internalAddress}:${externalPort} (${portDef.protocol})`);

    const rule = await unifi.createPortForward({
      name: ruleName,
      externalPort,
      internalIp: server.internalAddress,
      internalPort: externalPort, // Same as external - game listens on allocated port
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

async function handleDelete(ctx: JobContext): Promise<ExecutionResult> {
  const { game, server, log } = ctx;

  log(`Starting delete process for server ${server.name}`);

  // 1. Stop server if running
  if (server.status === ServerStatus.Running) {
    log("Server is running, stopping first...");
    const stopResult = await handleStop(ctx);
    if (!stopResult.success) {
      log(`Warning: Failed to stop server: ${stopResult.error}`);
      // Continue with deletion anyway
    } else {
      log("Server stopped successfully");
    }
  }

  // 2. Run deprovision playbook (optional, continue on failure)
  if (game.playbooks.deprovision && server.internalAddress) {
    log("Running deprovision playbook...");
    try {
      const result = await runPlaybookWithLogging(game.playbooks.deprovision, ctx);
      if (!result.success) {
        log(`Warning: Deprovision playbook failed: ${result.error}`);
        // Continue with cleanup anyway
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Warning: Deprovision playbook error: ${error}`);
      // Continue with cleanup anyway
    }
  }

  // 3. Delete port forwarding rules
  if (isUniFiConfigured()) {
    log("Removing port forwarding rules...");
    try {
      await deletePortForwardingRules(ctx);
      log("Port forwarding rules removed");
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Warning: Failed to remove port forwarding rules: ${error}`);
      // Continue with cleanup anyway
    }
  }

  // 4. Destroy VM
  if (server.vmId && isProxmoxConfigured()) {
    log(`Destroying VM ${server.vmId}...`);
    try {
      const provisioner = getVmProvisioner();
      await provisioner.destroyVm(server.vmId, server.vmNode);
      log(`VM ${server.vmId} destroyed`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log(`Warning: Failed to destroy VM: ${error}`);
      // Continue with cleanup anyway - VM may already be gone
    }
  }

  // 5. Release port allocations
  log("Releasing port allocations...");
  releasePorts(server.id);
  log("Port allocations released");

  // 6. Soft delete the record
  log("Marking server as deleted...");
  serversRepo.softDeleteServer(server.id);
  log("Server deleted successfully");

  return { success: true, logs: [] };
}

async function handleInstallMods(ctx: JobContext): Promise<ExecutionResult> {
  const { game, server, log } = ctx;

  // Check if game supports mods
  if (!game.modsConfig?.enabled) {
    return {
      success: false,
      error: `Game ${game.name} does not support mods`,
      logs: [],
    };
  }

  // Check if install-mods playbook is configured
  if (!game.playbooks.installMods) {
    return {
      success: false,
      error: `No install-mods playbook configured for ${game.name}`,
      logs: [],
    };
  }

  // Check if server has any mods configured
  const mods = server.mods ?? [];
  if (mods.length === 0) {
    log("No mods configured for this server");
    return { success: true, logs: [] };
  }

  const enabledMods = mods.filter((m) => m.enabled);
  log(`Installing ${enabledMods.length} enabled mods (${mods.length} total configured)`);

  // Log mod details
  for (const mod of enabledMods) {
    log(`  - ${mod.name ?? mod.id} (source: ${mod.source}${mod.version ? `, version: ${mod.version}` : ""})`);
  }

  // Run the install-mods playbook
  return runPlaybookWithLogging(game.playbooks.installMods, ctx);
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

// SFTP Action Handlers

async function handleSetupSftp(ctx: JobContext): Promise<ExecutionResult> {
  const { server, log } = ctx;

  // Get SFTP password from server config (stored temporarily by API)
  const config = server.config as Record<string, unknown>;
  const sftpPassword = config._sftpPassword as string | undefined;

  if (!sftpPassword) {
    return {
      success: false,
      error: "SFTP password not found in server config",
      logs: [],
    };
  }

  log("Setting up SFTP access...");

  // Run the setup-sftp playbook
  const result = await runPlaybookWithLogging(
    "ansible/playbooks/setup-sftp.yaml",
    ctx,
    { sftp_password: sftpPassword }
  );

  if (result.success) {
    // Clear the temporary password from server config
    const cleanConfig = { ...config };
    delete cleanConfig._sftpPassword;
    serversRepo.updateServer(server.id, { config: cleanConfig as Record<string, string | number | boolean> });
    log("SFTP access configured successfully");
  }

  return result;
}

async function handleDisableSftp(ctx: JobContext): Promise<ExecutionResult> {
  const { server, log } = ctx;

  log("Disabling SFTP access...");

  // Run the disable-sftp playbook
  const result = await runPlaybookWithLogging(
    "ansible/playbooks/disable-sftp.yaml",
    ctx
  );

  if (result.success) {
    // Delete SFTP access record
    sftpRepo.deleteSftpAccessByServer(server.id);
    log("SFTP access disabled and record deleted");
  }

  return result;
}

async function handleResetSftpPassword(ctx: JobContext): Promise<ExecutionResult> {
  const { server, log } = ctx;

  // Get new SFTP password from server config (stored temporarily by API)
  const config = server.config as Record<string, unknown>;
  const sftpPassword = config._sftpPassword as string | undefined;

  if (!sftpPassword) {
    return {
      success: false,
      error: "SFTP password not found in server config",
      logs: [],
    };
  }

  log("Resetting SFTP password...");

  // Run the setup-sftp playbook (same playbook, just updates password)
  const result = await runPlaybookWithLogging(
    "ansible/playbooks/setup-sftp.yaml",
    ctx,
    { sftp_password: sftpPassword }
  );

  if (result.success) {
    // Clear the temporary password from server config
    const cleanConfig = { ...config };
    delete cleanConfig._sftpPassword;
    serversRepo.updateServer(server.id, { config: cleanConfig as Record<string, string | number | boolean> });
    log("SFTP password reset successfully");
  }

  return result;
}
