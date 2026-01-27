import { randomUUID } from "node:crypto";
import { getDatabase } from "../schema.js";
import type { Job, JobStatus, JobAction, CreateJobInput } from "@discord-server-manager/shared";

interface JobRow {
  id: string;
  server_id: string;
  action: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  logs: string | null;
  notify_channel_id: string | null;
  notify_user_id: string | null;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    serverId: row.server_id,
    action: row.action as JobAction,
    status: row.status as JobStatus,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    error: row.error ?? undefined,
    logs: row.logs ? (JSON.parse(row.logs) as string[]) : undefined,
    notifyChannelId: row.notify_channel_id ?? undefined,
    notifyUserId: row.notify_user_id ?? undefined,
  };
}

/**
 * Create a new job
 */
export function createJob(input: CreateJobInput & { notifyChannelId?: string; notifyUserId?: string }): Job {
  const db = getDatabase();
  const id = randomUUID();

  const stmt = db.prepare(`
    INSERT INTO jobs (id, server_id, action, status, notify_channel_id, notify_user_id)
    VALUES (?, ?, ?, 'queued', ?, ?)
  `);

  stmt.run(id, input.serverId, input.action, input.notifyChannelId ?? null, input.notifyUserId ?? null);

  return {
    id,
    serverId: input.serverId,
    action: input.action,
    status: "queued" as JobStatus,
    notifyChannelId: input.notifyChannelId,
    notifyUserId: input.notifyUserId,
  };
}

/**
 * Get a job by ID
 */
export function getJobById(id: string): Job | null {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM jobs WHERE id = ?");
  const row = stmt.get(id) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Get all jobs for a server
 */
export function getJobsByServer(serverId: string): Job[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM jobs WHERE server_id = ? ORDER BY started_at DESC");
  const rows = stmt.all(serverId) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Get jobs by status
 */
export function getJobsByStatus(status: JobStatus): Job[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM jobs WHERE status = ?");
  const rows = stmt.all(status) as JobRow[];
  return rows.map(rowToJob);
}

/**
 * Start a job (set status to running)
 */
export function startJob(id: string): Job | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE jobs SET status = 'running', started_at = ?
    WHERE id = ? AND status = 'queued'
  `);

  const result = stmt.run(now, id);
  if (result.changes === 0) {
    return null;
  }

  return getJobById(id);
}

/**
 * Complete a job (set status to completed or failed)
 */
export function completeJob(id: string, error?: string): Job | null {
  const db = getDatabase();
  const now = new Date().toISOString();
  const status = error ? "failed" : "completed";

  const stmt = db.prepare(`
    UPDATE jobs SET status = ?, completed_at = ?, error = ?
    WHERE id = ? AND status = 'running'
  `);

  const result = stmt.run(status, now, error ?? null, id);
  if (result.changes === 0) {
    return null;
  }

  return getJobById(id);
}

/**
 * Append a log entry to a job
 */
export function appendJobLog(id: string, log: string): void {
  const db = getDatabase();

  const job = getJobById(id);
  if (!job) {
    return;
  }

  const logs = job.logs ?? [];
  logs.push(log);

  const stmt = db.prepare("UPDATE jobs SET logs = ? WHERE id = ?");
  stmt.run(JSON.stringify(logs), id);
}

/**
 * Get the latest job for a server
 */
export function getLatestJobForServer(serverId: string): Job | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM jobs
    WHERE server_id = ?
    ORDER BY started_at DESC NULLS LAST
    LIMIT 1
  `);
  const row = stmt.get(serverId) as JobRow | undefined;
  return row ? rowToJob(row) : null;
}

/**
 * Get queued jobs (for job runner)
 */
export function getQueuedJobs(limit: number = 10): Job[] {
  const db = getDatabase();
  const stmt = db.prepare("SELECT * FROM jobs WHERE status = 'queued' LIMIT ?");
  const rows = stmt.all(limit) as JobRow[];
  return rows.map(rowToJob);
}
