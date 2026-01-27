import { getProxmoxConfig, getTemplateForGame } from "../config/proxmox.js";

// Allow self-signed certs for Proxmox (common in homelab setups)
// Can be disabled by setting PROXMOX_VERIFY_SSL=true
if (process.env.PROXMOX_VERIFY_SSL !== "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export interface ProxmoxVmStatus {
  vmid: number;
  name: string;
  status: "running" | "stopped" | "paused";
  uptime: number;
  cpus: number;
  mem: number;
  maxmem: number;
  disk: number;
  maxdisk: number;
  netin: number;
  netout: number;
  pid?: number;
  qmpstatus?: string;
}

export interface NetworkInterface {
  name: string;
  "hardware-address": string;
  "ip-addresses"?: Array<{
    "ip-address": string;
    "ip-address-type": "ipv4" | "ipv6";
    prefix: number;
  }>;
}

export interface CloneOptions {
  name: string;
  description?: string;
  cores?: number;
  memory?: number;
  pool?: string;
}

export class ProxmoxError extends Error {
  status: number;
  errors?: Record<string, string>;

  constructor(status: number, message: string, errors?: Record<string, string>) {
    const errorDetails = errors ? ` - ${JSON.stringify(errors)}` : "";
    super(`Proxmox API error ${status}: ${message}${errorDetails}`);
    this.name = "ProxmoxError";
    this.status = status;
    this.errors = errors;
  }
}

/**
 * Proxmox API Client
 */
export class ProxmoxClient {
  private baseUrl: string;
  private tokenId: string;
  private tokenSecret: string;

  constructor() {
    const config = getProxmoxConfig();
    this.baseUrl = config.host.replace(/\/$/, "");
    this.tokenId = config.tokenId;
    this.tokenSecret = config.tokenSecret;
  }

  private get authHeader(): string {
    return `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${this.baseUrl}/api2/json${path}`;

    const headers: Record<string, string> = {
      Authorization: this.authHeader,
    };

    let requestBody: string | undefined;
    if (body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        params.set(key, String(value));
      }
      requestBody = params.toString();
    }

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
    });

    const json = await response.json() as { data?: T; errors?: Record<string, string> };

    if (!response.ok) {
      throw new ProxmoxError(response.status, response.statusText, json.errors);
    }

    return json.data as T;
  }

  /**
   * Get next available VM ID in the configured range
   */
  async getNextVmId(): Promise<number> {
    const config = getProxmoxConfig();
    const { start, end } = config.vmIdRange;

    // Get all existing VMs
    const vms = await this.request<Array<{ vmid: number }>>("GET", "/cluster/resources?type=vm");
    const usedIds = new Set(vms.map((vm) => vm.vmid));

    // Find first available ID in range
    for (let id = start; id <= end; id++) {
      if (!usedIds.has(id)) {
        return id;
      }
    }

    throw new Error(`No available VM IDs in range ${start}-${end}`);
  }

  /**
   * Clone a VM from template
   */
  async cloneVm(
    templateVmId: number,
    newVmId: number,
    node: string,
    options: CloneOptions
  ): Promise<string> {
    const config = getProxmoxConfig();

    const body: Record<string, unknown> = {
      newid: newVmId,
      name: options.name,
      full: 1, // Full clone, not linked
      storage: config.storage,
    };

    if (options.description) {
      body.description = options.description;
    }

    if (options.pool) {
      body.pool = options.pool;
    }

    // Clone returns a task ID (UPID)
    const upid = await this.request<string>(
      "POST",
      `/nodes/${node}/qemu/${templateVmId}/clone`,
      body
    );

    return upid;
  }

  /**
   * Wait for a task to complete
   */
  async waitForTask(node: string, upid: string, timeoutSec: number = 120): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = timeoutSec * 1000;

    while (Date.now() - startTime < timeoutMs) {
      const status = await this.request<{ status: string; exitstatus?: string }>(
        "GET",
        `/nodes/${node}/tasks/${encodeURIComponent(upid)}/status`
      );

      if (status.status === "stopped") {
        if (status.exitstatus !== "OK") {
          throw new Error(`Task failed: ${status.exitstatus}`);
        }
        return;
      }

      // Wait 2 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error(`Task timed out after ${timeoutSec} seconds`);
  }

  /**
   * Configure VM hardware (cores, memory)
   */
  async configureVm(
    node: string,
    vmId: number,
    cores?: number,
    memory?: number
  ): Promise<void> {
    const body: Record<string, unknown> = {};

    if (cores !== undefined) {
      body.cores = cores;
    }

    if (memory !== undefined) {
      body.memory = memory;
    }

    if (Object.keys(body).length > 0) {
      await this.request("PUT", `/nodes/${node}/qemu/${vmId}/config`, body);
    }
  }

  /**
   * Configure VM network interface
   */
  async configureNetwork(
    node: string,
    vmId: number,
    options: {
      bridge?: string;
      vlanTag?: number;
      netDevice?: string; // e.g., "net0"
    }
  ): Promise<void> {
    const config = getProxmoxConfig();
    const bridge = options.bridge ?? config.networkBridge;
    const netDevice = options.netDevice ?? "net0";

    // Build network config string: virtio,bridge=vmbr0,tag=100
    let netConfig = `virtio,bridge=${bridge}`;
    if (options.vlanTag) {
      netConfig += `,tag=${options.vlanTag}`;
    }

    await this.request("PUT", `/nodes/${node}/qemu/${vmId}/config`, {
      [netDevice]: netConfig,
    });
  }

  /**
   * Configure cloud-init settings on a VM
   */
  async configureCloudInit(
    node: string,
    vmId: number,
    options: {
      user?: string;
      password?: string;
      sshKeys?: string;
      ipConfig?: string;
      nameserver?: string;
      searchDomain?: string;
      /** Custom cloud-init snippet (e.g., "local:snippets/gameserver-init.yaml") */
      customUserData?: string;
    }
  ): Promise<void> {
    const body: Record<string, unknown> = {};

    if (options.user) {
      body.ciuser = options.user;
    }

    if (options.password) {
      body.cipassword = options.password;
    }

    if (options.sshKeys) {
      // SSH keys need to be URL encoded
      body.sshkeys = encodeURIComponent(options.sshKeys);
    }

    // IP config: ip=dhcp or ip=x.x.x.x/24,gw=x.x.x.x
    if (options.ipConfig) {
      body.ipconfig0 = options.ipConfig;
    } else {
      body.ipconfig0 = "ip=dhcp";
    }

    if (options.nameserver) {
      body.nameserver = options.nameserver;
    }

    if (options.searchDomain) {
      body.searchdomain = options.searchDomain;
    }

    // Custom cloud-init user-data snippet
    if (options.customUserData) {
      body.cicustom = `user=${options.customUserData}`;
    }

    if (Object.keys(body).length > 0) {
      await this.request("PUT", `/nodes/${node}/qemu/${vmId}/config`, body);
    }
  }

  /**
   * Resize a VM disk
   */
  async resizeDisk(
    node: string,
    vmId: number,
    disk: string,
    sizeGb: number
  ): Promise<void> {
    await this.request("PUT", `/nodes/${node}/qemu/${vmId}/resize`, {
      disk,
      size: `${sizeGb}G`,
    });
  }

  /**
   * Start a VM
   */
  async startVm(node: string, vmId: number): Promise<string> {
    return this.request<string>("POST", `/nodes/${node}/qemu/${vmId}/status/start`);
  }

  /**
   * Stop a VM
   */
  async stopVm(node: string, vmId: number): Promise<string> {
    return this.request<string>("POST", `/nodes/${node}/qemu/${vmId}/status/stop`);
  }

  /**
   * Shutdown a VM gracefully (requires guest agent)
   */
  async shutdownVm(node: string, vmId: number): Promise<string> {
    return this.request<string>("POST", `/nodes/${node}/qemu/${vmId}/status/shutdown`);
  }

  /**
   * Delete a VM
   */
  async deleteVm(node: string, vmId: number): Promise<string> {
    return this.request<string>("DELETE", `/nodes/${node}/qemu/${vmId}`);
  }

  /**
   * Get VM status
   */
  async getVmStatus(node: string, vmId: number): Promise<ProxmoxVmStatus> {
    return this.request<ProxmoxVmStatus>("GET", `/nodes/${node}/qemu/${vmId}/status/current`);
  }

  /**
   * Get network interfaces from guest agent
   */
  async getNetworkInterfaces(node: string, vmId: number): Promise<NetworkInterface[]> {
    const result = await this.request<{ result: NetworkInterface[] }>(
      "GET",
      `/nodes/${node}/qemu/${vmId}/agent/network-get-interfaces`
    );
    return result.result;
  }

  /**
   * Wait for guest agent to report an IP address
   * Returns the first non-loopback IPv4 address found
   */
  async waitForIpAddress(
    node: string,
    vmId: number,
    timeoutSec: number = 180
  ): Promise<string> {
    const startTime = Date.now();
    const timeoutMs = timeoutSec * 1000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const interfaces = await this.getNetworkInterfaces(node, vmId);

        for (const iface of interfaces) {
          // Skip loopback
          if (iface.name === "lo") continue;

          for (const addr of iface["ip-addresses"] ?? []) {
            if (addr["ip-address-type"] === "ipv4" && !addr["ip-address"].startsWith("127.")) {
              return addr["ip-address"];
            }
          }
        }
      } catch {
        // Guest agent not ready yet, continue waiting
      }

      // Wait 5 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error(`Timed out waiting for IP address after ${timeoutSec} seconds`);
  }
}

/**
 * High-level VM provisioning for game servers
 */
export class VmProvisioner {
  private client: ProxmoxClient;

  constructor() {
    this.client = new ProxmoxClient();
  }

  /**
   * Get VM resources for a game (with defaults)
   */
  private getResourcesForGame(gameId: string): { cores: number; memory: number; disk: number } {
    const config = getProxmoxConfig();

    // Check for game-specific template/resources
    const template = getTemplateForGame(gameId);
    if (template) {
      return {
        cores: template.cores,
        memory: template.memory,
        disk: template.disk,
      };
    }

    // Fall back to default resources
    return config.defaultResources;
  }

  /**
   * Provision a new VM for a game server
   * Returns the VM ID and IP address
   *
   * Uses cloud-init to configure the VM on first boot.
   * The base image should have qemu-guest-agent installed or include it
   * in cloud-init user-data.
   */
  async provisionVm(
    gameId: string,
    serverId: string,
    serverName: string
  ): Promise<{ vmId: number; ipAddress: string }> {
    const config = getProxmoxConfig();

    // Determine which VM to clone from
    const template = getTemplateForGame(gameId);
    const sourceVmId = template?.vmId ?? config.baseImageVmId;

    if (!sourceVmId) {
      throw new Error(
        "No base image configured. Set PROXMOX_BASE_IMAGE_VMID to a cloud image VM ID."
      );
    }

    const node = template?.node ?? config.defaultNode;
    const resources = this.getResourcesForGame(gameId);
    const vmId = await this.client.getNextVmId();

    console.log(`Provisioning VM ${vmId} for server ${serverId} (${gameId})`);
    console.log(`  Source VM: ${sourceVmId}, Node: ${node}`);
    console.log(`  Resources: ${resources.cores} cores, ${resources.memory}MB RAM, ${resources.disk}GB disk`);

    // Clone from base image
    const cloneUpid = await this.client.cloneVm(sourceVmId, vmId, node, {
      name: `gs-${serverId.slice(0, 8)}`,
      description: `Game server: ${serverName}\nServer ID: ${serverId}\nGame: ${gameId}`,
    });

    console.log(`Clone task started: ${cloneUpid}`);
    await this.client.waitForTask(node, cloneUpid, config.timeouts.clone);
    console.log(`Clone completed for VM ${vmId}`);

    // Configure VM hardware
    await this.client.configureVm(node, vmId, resources.cores, resources.memory);
    console.log(`VM hardware configured`);

    // Resize disk if needed (cloud images typically have small disks)
    if (resources.disk > 0) {
      try {
        await this.client.resizeDisk(node, vmId, "scsi0", resources.disk);
        console.log(`Disk resized to ${resources.disk}GB`);
      } catch (err) {
        // Disk resize might fail if already larger, that's OK
        console.log(`Disk resize skipped: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Configure cloud-init
    await this.client.configureCloudInit(node, vmId, {
      user: config.cloudInit.user,
      password: config.cloudInit.password,
      sshKeys: config.cloudInit.sshPublicKey,
      nameserver: config.cloudInit.nameserver,
      searchDomain: config.cloudInit.searchDomain,
      customUserData: config.cloudInit.customUserData,
    });
    console.log(`Cloud-init configured (user: ${config.cloudInit.user})`);

    // Configure network (with VLAN tag if specified)
    if (config.vlanTag) {
      await this.client.configureNetwork(node, vmId, {
        bridge: config.networkBridge,
        vlanTag: config.vlanTag,
      });
      console.log(`Network configured (bridge: ${config.networkBridge}, VLAN: ${config.vlanTag})`);
    }

    // Start the VM
    const startUpid = await this.client.startVm(node, vmId);
    await this.client.waitForTask(node, startUpid, config.timeouts.start);
    console.log(`VM ${vmId} started`);

    // Wait for guest agent to report IP
    console.log(`Waiting for guest agent to report IP...`);
    const ipAddress = await this.client.waitForIpAddress(node, vmId, config.timeouts.guestAgent);
    console.log(`VM ${vmId} has IP: ${ipAddress}`);

    return { vmId, ipAddress };
  }

  /**
   * Destroy a VM
   */
  async destroyVm(vmId: number, node?: string): Promise<void> {
    const config = getProxmoxConfig();
    const targetNode = node ?? config.defaultNode;

    // Try to stop gracefully first
    try {
      const status = await this.client.getVmStatus(targetNode, vmId);
      if (status.status === "running") {
        console.log(`Stopping VM ${vmId}...`);
        const stopUpid = await this.client.stopVm(targetNode, vmId);
        await this.client.waitForTask(targetNode, stopUpid, 60);
      }
    } catch {
      // VM might already be stopped or not exist
    }

    // Delete the VM
    console.log(`Deleting VM ${vmId}...`);
    const deleteUpid = await this.client.deleteVm(targetNode, vmId);
    await this.client.waitForTask(targetNode, deleteUpid, 60);
    console.log(`VM ${vmId} deleted`);
  }

  /**
   * Get IP address of a VM
   */
  async getVmIpAddress(vmId: number, node?: string): Promise<string | null> {
    const config = getProxmoxConfig();
    const targetNode = node ?? config.defaultNode;

    try {
      const interfaces = await this.client.getNetworkInterfaces(targetNode, vmId);

      for (const iface of interfaces) {
        if (iface.name === "lo") continue;

        for (const addr of iface["ip-addresses"] ?? []) {
          if (addr["ip-address-type"] === "ipv4" && !addr["ip-address"].startsWith("127.")) {
            return addr["ip-address"];
          }
        }
      }
    } catch {
      // Guest agent not available
    }

    return null;
  }
}

// Singleton instances
let proxmoxClient: ProxmoxClient | null = null;
let vmProvisioner: VmProvisioner | null = null;

export function getProxmoxClient(): ProxmoxClient {
  if (!proxmoxClient) {
    proxmoxClient = new ProxmoxClient();
  }
  return proxmoxClient;
}

export function getVmProvisioner(): VmProvisioner {
  if (!vmProvisioner) {
    vmProvisioner = new VmProvisioner();
  }
  return vmProvisioner;
}
