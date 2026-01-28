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
export type JobAction = "provision" | "start" | "stop" | "backup" | "update" | "deprovision" | "delete";

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
  /** Discord channel ID to send notification when job completes */
  notifyChannelId?: string;
  /** Discord user ID to mention in the notification */
  notifyUserId?: string;
}

/**
 * Input for creating a new job
 */
export interface CreateJobInput {
  serverId: string;
  action: JobAction;
}
