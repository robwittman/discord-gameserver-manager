import { ServerStatus, JobStatus } from "../../api/client";

interface ServerStatusBadgeProps {
  status: ServerStatus;
}

interface JobStatusBadgeProps {
  status: JobStatus;
}

const serverStatusConfig: Record<
  ServerStatus,
  { label: string; className: string }
> = {
  [ServerStatus.PendingPorts]: {
    label: "Pending Ports",
    className: "bg-yellow-100 text-yellow-800",
  },
  [ServerStatus.Pending]: {
    label: "Pending",
    className: "bg-yellow-100 text-yellow-800",
  },
  [ServerStatus.Provisioning]: {
    label: "Provisioning",
    className: "bg-blue-100 text-blue-800",
  },
  [ServerStatus.Running]: {
    label: "Running",
    className: "bg-green-100 text-green-800",
  },
  [ServerStatus.Stopped]: {
    label: "Stopped",
    className: "bg-gray-100 text-gray-800",
  },
  [ServerStatus.Error]: {
    label: "Error",
    className: "bg-red-100 text-red-800",
  },
  [ServerStatus.Deleting]: {
    label: "Deleting",
    className: "bg-red-100 text-red-800",
  },
};

const jobStatusConfig: Record<JobStatus, { label: string; className: string }> =
  {
    [JobStatus.Queued]: {
      label: "Queued",
      className: "bg-gray-100 text-gray-800",
    },
    [JobStatus.Running]: {
      label: "Running",
      className: "bg-blue-100 text-blue-800",
    },
    [JobStatus.Completed]: {
      label: "Completed",
      className: "bg-green-100 text-green-800",
    },
    [JobStatus.Failed]: {
      label: "Failed",
      className: "bg-red-100 text-red-800",
    },
  };

export function ServerStatusBadge({ status }: ServerStatusBadgeProps) {
  const config = serverStatusConfig[status] || {
    label: status,
    className: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}

export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const config = jobStatusConfig[status] || {
    label: status,
    className: "bg-gray-100 text-gray-800",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  );
}
