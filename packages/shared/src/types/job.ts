/**
 * Status of a provisioning job
 */
export enum JobStatus {
  Queued = "queued",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

/**
 * Types of actions a job can perform
 */
export type JobAction = "provision" | "start" | "stop" | "backup" | "update" | "deprovision";

/**
 * A provisioning job for managing servers
 */
export interface Job {
  id: string;
  serverId: string;
  action: JobAction;
  status: JobStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs?: string[];
}

/**
 * Input for creating a new job
 */
export interface CreateJobInput {
  serverId: string;
  action: JobAction;
}
