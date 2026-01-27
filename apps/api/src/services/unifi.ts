/**
 * UniFi Network API Client for managing port forwarding rules on UDM Pro
 *
 * Uses cookie-based authentication with username/password for UDM Pro.
 * Requires a local admin account (not cloud account) to avoid MFA issues.
 */

const UNIFI_API_URL = process.env.UNIFI_API_URL ?? "https://192.168.1.1";
const UNIFI_USERNAME = process.env.UNIFI_USERNAME;
const UNIFI_PASSWORD = process.env.UNIFI_PASSWORD;
const UNIFI_SITE = process.env.UNIFI_SITE ?? "default";

// Allow self-signed certs for UniFi (common in local setups)
if (process.env.UNIFI_VERIFY_SSL !== "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export interface PortForwardRule {
  _id?: string;
  name: string;
  enabled: boolean;
  pfwd_interface: "wan" | "wan2" | "all";
  src: "any" | string;
  dst_port: string;
  fwd: string; // Forward to IP
  fwd_port: string;
  proto: "tcp" | "udp" | "tcp_udp";
  log?: boolean;
  site_id?: string;
}

export interface CreatePortForwardInput {
  name: string;
  externalPort: number;
  internalIp: string;
  internalPort: number;
  protocol: "tcp" | "udp" | "tcp_udp";
}

export class UniFiClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private site: string;
  private cookies: string | null = null;
  private csrfToken: string | null = null;

  constructor() {
    if (!UNIFI_USERNAME || !UNIFI_PASSWORD) {
      throw new Error("UNIFI_USERNAME and UNIFI_PASSWORD environment variables are required");
    }
    this.baseUrl = UNIFI_API_URL.replace(/\/$/, "");
    this.username = UNIFI_USERNAME;
    this.password = UNIFI_PASSWORD;
    this.site = UNIFI_SITE;
  }

  /**
   * Authenticate with the UniFi controller and get session cookies
   */
  private async login(): Promise<void> {
    // UDM Pro login endpoint
    const loginUrl = `${this.baseUrl}/api/auth/login`;

    const response = await fetch(loginUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`UniFi login failed: ${response.status} ${response.statusText} - ${text}`);
    }

    // Extract cookies from response
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      this.cookies = setCookies.map(c => c.split(";")[0]).join("; ");
    }

    // Extract CSRF token from response headers or body
    const csrfToken = response.headers.get("x-csrf-token");
    if (csrfToken) {
      this.csrfToken = csrfToken;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.cookies) {
      await this.login();
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    await this.ensureAuthenticated();

    // UDM Pro requires /proxy/network prefix
    const url = `${this.baseUrl}/proxy/network/api/s/${this.site}${path}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.cookies) {
      headers["Cookie"] = this.cookies;
    }

    if (this.csrfToken) {
      headers["X-CSRF-Token"] = this.csrfToken;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // If unauthorized, try to re-login and retry
    if (response.status === 401) {
      this.cookies = null;
      await this.login();

      // Retry the request
      const retryHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.cookies) {
        retryHeaders["Cookie"] = this.cookies;
      }
      if (this.csrfToken) {
        retryHeaders["X-CSRF-Token"] = this.csrfToken;
      }

      const retryResponse = await fetch(url, {
        method,
        headers: retryHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!retryResponse.ok) {
        const text = await retryResponse.text();
        throw new Error(`UniFi API error: ${retryResponse.status} ${retryResponse.statusText} - ${text}`);
      }

      const retryJson = await retryResponse.json() as { data?: T; meta?: { rc: string; msg?: string } };
      if (retryJson.meta?.rc !== "ok") {
        throw new Error(`UniFi API error: ${retryJson.meta?.msg ?? "Unknown error"}`);
      }
      return retryJson.data as T;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`UniFi API error: ${response.status} ${response.statusText} - ${text}`);
    }

    const json = await response.json() as { data?: T; meta?: { rc: string; msg?: string } };

    if (json.meta?.rc !== "ok") {
      throw new Error(`UniFi API error: ${json.meta?.msg ?? "Unknown error"}`);
    }

    return json.data as T;
  }

  /**
   * List all port forwarding rules
   */
  async listPortForwards(): Promise<PortForwardRule[]> {
    return this.request<PortForwardRule[]>("GET", "/rest/portforward");
  }

  /**
   * Get a specific port forwarding rule by ID
   */
  async getPortForward(ruleId: string): Promise<PortForwardRule | null> {
    const rules = await this.listPortForwards();
    return rules.find((r) => r._id === ruleId) ?? null;
  }

  /**
   * Find a port forwarding rule by name
   */
  async findPortForwardByName(name: string): Promise<PortForwardRule | null> {
    const rules = await this.listPortForwards();
    return rules.find((r) => r.name === name) ?? null;
  }

  /**
   * Create a new port forwarding rule
   */
  async createPortForward(input: CreatePortForwardInput): Promise<PortForwardRule> {
    const rule: Omit<PortForwardRule, "_id" | "site_id"> = {
      name: input.name,
      enabled: true,
      pfwd_interface: "wan",
      src: "any",
      dst_port: String(input.externalPort),
      fwd: input.internalIp,
      fwd_port: String(input.internalPort),
      proto: input.protocol,
      log: false,
    };

    const result = await this.request<PortForwardRule[]>("POST", "/rest/portforward", rule);
    const created = result[0];
    if (!created) {
      throw new Error("No rule returned from create");
    }
    return created;
  }

  /**
   * Update an existing port forwarding rule
   */
  async updatePortForward(ruleId: string, updates: Partial<CreatePortForwardInput>): Promise<PortForwardRule> {
    const existing = await this.getPortForward(ruleId);
    if (!existing) {
      throw new Error(`Port forward rule not found: ${ruleId}`);
    }

    const updated: PortForwardRule = {
      ...existing,
      ...(updates.name && { name: updates.name }),
      ...(updates.externalPort && { dst_port: String(updates.externalPort) }),
      ...(updates.internalIp && { fwd: updates.internalIp }),
      ...(updates.internalPort && { fwd_port: String(updates.internalPort) }),
      ...(updates.protocol && { proto: updates.protocol }),
    };

    const result = await this.request<PortForwardRule[]>("PUT", `/rest/portforward/${ruleId}`, updated);
    const rule = result[0];
    if (!rule) {
      throw new Error("No rule returned from update");
    }
    return rule;
  }

  /**
   * Delete a port forwarding rule
   */
  async deletePortForward(ruleId: string): Promise<void> {
    await this.request("DELETE", `/rest/portforward/${ruleId}`);
  }

  /**
   * Enable or disable a port forwarding rule
   */
  async setPortForwardEnabled(ruleId: string, enabled: boolean): Promise<PortForwardRule> {
    const result = await this.request<PortForwardRule[]>("PUT", `/rest/portforward/${ruleId}`, { enabled });
    const rule = result[0];
    if (!rule) {
      throw new Error("No rule returned from update");
    }
    return rule;
  }
}

// Singleton instance
let unifiClient: UniFiClient | null = null;

/**
 * Get the UniFi client instance
 * Returns null if credentials are not configured
 */
export function getUniFiClient(): UniFiClient | null {
  if (!UNIFI_USERNAME || !UNIFI_PASSWORD) {
    return null;
  }
  if (!unifiClient) {
    unifiClient = new UniFiClient();
  }
  return unifiClient;
}

/**
 * Check if UniFi integration is configured
 */
export function isUniFiConfigured(): boolean {
  return !!(UNIFI_USERNAME && UNIFI_PASSWORD);
}
