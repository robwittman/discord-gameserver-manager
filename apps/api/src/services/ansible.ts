import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANSIBLE_DIR = process.env.ANSIBLE_DIR ?? join(__dirname, "../../../../ansible");
const ANSIBLE_INVENTORY = process.env.ANSIBLE_INVENTORY ?? join(ANSIBLE_DIR, "inventory.ini");
const SSH_PRIVATE_KEY = process.env.SSH_PRIVATE_KEY_PATH ?? join(process.env.HOME ?? "", ".ssh/id_ed25519");

export interface AnsibleVariables {
  server_id: string;
  server_name: string;
  game_id: string;
  ports: Record<string, number>;
  config: Record<string, unknown>;
  internal_address?: string;
  [key: string]: unknown;
}

export interface AnsibleResult {
  success: boolean;
  exitCode: number;
  stdout: string[];
  stderr: string[];
  error?: string;
}

export interface AnsibleOptions {
  /** Timeout in milliseconds (default: 10 minutes) */
  timeout?: number;
  /** Additional extra-vars to pass */
  extraVars?: Record<string, unknown>;
  /** Callback for real-time output */
  onOutput?: (line: string) => void;
  /** Target hosts (default: from inventory) */
  limit?: string;
  /** Run in check mode (dry run) */
  check?: boolean;
  /** Verbosity level (0-4) */
  verbosity?: number;
  /**
   * Target host to run against (bypasses inventory file).
   * Use this for dynamic hosts not in the static inventory.
   */
  targetHost?: string;
  /** SSH user for targetHost (default: root) */
  targetUser?: string;
}

const DEFAULT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

/**
 * Execute an Ansible playbook
 */
export async function runPlaybook(
  playbookPath: string,
  variables: AnsibleVariables,
  options: AnsibleOptions = {}
): Promise<AnsibleResult> {
  const fullPath = join(ANSIBLE_DIR, playbookPath);

  // Verify playbook exists
  if (!existsSync(fullPath)) {
    return {
      success: false,
      exitCode: -1,
      stdout: [],
      stderr: [],
      error: `Playbook not found: ${fullPath}`,
    };
  }

  // Build extra-vars JSON
  const extraVars = {
    ...variables,
    ...options.extraVars,
  };

  // Build command arguments
  const args: string[] = [
    fullPath,
    "--extra-vars",
    JSON.stringify(extraVars),
  ];

  // Handle inventory: either dynamic host or static inventory file
  if (options.targetHost) {
    // Dynamic inventory: use comma-separated host format
    // Format: "user@host," - trailing comma is required for single host
    const user = options.targetUser ?? "root";
    const hostSpec = `${user}@${options.targetHost},`;
    args.push("-i", hostSpec);
  } else if (existsSync(ANSIBLE_INVENTORY)) {
    // Static inventory file
    args.push("-i", ANSIBLE_INVENTORY);
  }

  // Add optional flags
  if (options.limit) {
    args.push("--limit", options.limit);
  }

  if (options.check) {
    args.push("--check");
  }

  if (options.verbosity && options.verbosity > 0) {
    args.push(`-${"v".repeat(Math.min(options.verbosity, 4))}`);
  }

  // Add SSH private key if it exists
  if (existsSync(SSH_PRIVATE_KEY)) {
    args.push("--private-key", SSH_PRIVATE_KEY);
  }

  // Execute ansible-playbook
  return new Promise((resolve) => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const timeout = options.timeout ?? DEFAULT_TIMEOUT;
    let timedOut = false;

    const proc = spawn("ansible-playbook", args, {
      cwd: ANSIBLE_DIR,
      env: {
        ...process.env,
        ANSIBLE_FORCE_COLOR: "false",
        ANSIBLE_NOCOLOR: "true",
        PYTHONUNBUFFERED: "1",
      },
    });

    const timeoutId = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
      }, 5000);
    }, timeout);

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        stdout.push(line);
        options.onOutput?.(line);
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        stderr.push(line);
        options.onOutput?.(`[stderr] ${line}`);
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        error: `Failed to spawn ansible-playbook: ${err.message}`,
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        resolve({
          success: false,
          exitCode: code ?? -1,
          stdout,
          stderr,
          error: `Playbook execution timed out after ${timeout / 1000} seconds`,
        });
        return;
      }

      resolve({
        success: code === 0,
        exitCode: code ?? -1,
        stdout,
        stderr,
        error: code !== 0 ? `Playbook exited with code ${code}` : undefined,
      });
    });
  });
}

/**
 * Check if Ansible is available
 */
export async function checkAnsibleAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("ansible-playbook", ["--version"]);

    proc.on("error", () => {
      resolve(false);
    });

    proc.on("close", (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Get Ansible version
 */
export async function getAnsibleVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const proc = spawn("ansible-playbook", ["--version"]);
    let output = "";

    proc.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    proc.on("error", () => {
      resolve(null);
    });

    proc.on("close", (code) => {
      if (code === 0) {
        const match = output.match(/ansible[- ]playbook.*?(\d+\.\d+\.\d+)/i);
        const firstLine = output.split("\n")[0];
        resolve(match?.[1] ?? firstLine ?? null);
      } else {
        resolve(null);
      }
    });
  });
}
