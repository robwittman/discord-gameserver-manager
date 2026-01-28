import { useState } from "react";
import { useJobs, useJob } from "../hooks/useJobs";
import { Card } from "../components/common/Card";
import { JobStatusBadge } from "../components/common/StatusBadge";
import { Job, JobStatus } from "../api/client";

function JobDetail({ job }: { job: Job }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-sm text-gray-500">Action</dt>
          <dd className="font-medium capitalize">{job.action}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Status</dt>
          <dd>
            <JobStatusBadge status={job.status} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Started</dt>
          <dd className="text-sm">
            {job.startedAt ? new Date(job.startedAt).toLocaleString() : "-"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Completed</dt>
          <dd className="text-sm">
            {job.completedAt ? new Date(job.completedAt).toLocaleString() : "-"}
          </dd>
        </div>
      </div>

      {job.error && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-sm font-medium text-red-800">Error</p>
          <p className="text-sm text-red-700 mt-1">{job.error}</p>
        </div>
      )}

      {job.logs && job.logs.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Logs</p>
          <div className="bg-gray-900 rounded p-3 max-h-64 overflow-auto">
            <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap">
              {job.logs.join("\n")}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Jobs() {
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { data: jobs, isLoading, error } = useJobs();
  const { data: selectedJob } = useJob(selectedJobId ?? "");

  const filteredJobs =
    statusFilter === "all"
      ? jobs
      : jobs?.filter((j) => j.status === statusFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <p className="text-gray-500">View job history and logs</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(
          [
            { value: "all" as const, label: "All" },
            { value: JobStatus.Queued, label: "Queued" },
            { value: JobStatus.Running, label: "Running" },
            { value: JobStatus.Completed, label: "Completed" },
            { value: JobStatus.Failed, label: "Failed" },
          ] as const
        ).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
              statusFilter === value
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job List */}
        <Card title="Job History">
          {isLoading && <div className="text-gray-500">Loading jobs...</div>}
          {error && (
            <div className="text-red-500">Failed to load: {error.message}</div>
          )}
          {filteredJobs && filteredJobs.length === 0 && (
            <div className="text-gray-500">No jobs found</div>
          )}
          {filteredJobs && filteredJobs.length > 0 && (
            <div className="space-y-1 max-h-[600px] overflow-auto">
              {filteredJobs.map((job) => (
                <button
                  key={job.id}
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full text-left px-3 py-2 rounded transition-colors ${
                    selectedJobId === job.id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium capitalize">{job.action}</span>
                    <JobStatusBadge status={job.status} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    <span className="font-mono">{job.serverId.slice(0, 8)}...</span>
                    <span className="mx-2">|</span>
                    <span>
                      {job.startedAt
                        ? new Date(job.startedAt).toLocaleString()
                        : "Queued"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Job Detail */}
        <Card title="Job Details">
          {!selectedJobId && (
            <div className="text-gray-500 text-center py-8">
              Select a job to view details
            </div>
          )}
          {selectedJobId && !selectedJob && (
            <div className="text-gray-500">Loading job details...</div>
          )}
          {selectedJob && <JobDetail job={selectedJob} />}
        </Card>
      </div>
    </div>
  );
}
