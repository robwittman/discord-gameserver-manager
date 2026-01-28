import { useParams, Link } from "react-router-dom";
import { useServer } from "../hooks/useServer";
import { useMetrics } from "../hooks/useMetrics";
import { useJobs } from "../hooks/useJobs";
import { Card } from "../components/common/Card";
import { ServerStatusBadge, JobStatusBadge } from "../components/common/StatusBadge";
import { ServerActions } from "../components/servers/ServerActions";
import { ServerMetrics } from "../components/servers/ServerMetrics";

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: server, isLoading, error } = useServer(id!);
  const { data: metrics, isLoading: metricsLoading } = useMetrics(
    id!,
    server?.status
  );
  const { data: jobs } = useJobs(id);

  if (isLoading) {
    return (
      <div className="text-center py-8 text-gray-500">Loading server...</div>
    );
  }

  if (error || !server) {
    return (
      <div className="text-center py-8 text-red-500">
        Failed to load server: {error?.message ?? "Not found"}
      </div>
    );
  }

  const recentJobs = jobs?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="text-gray-500 hover:text-gray-700"
        >
          &larr; Back
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{server.name}</h1>
          <p className="text-gray-500">{server.gameId}</p>
        </div>
        <ServerStatusBadge status={server.status} />
      </div>

      {/* Actions */}
      <Card title="Actions">
        <ServerActions serverId={server.id} status={server.status} />
      </Card>

      {/* Metrics */}
      <Card title="Metrics">
        {metricsLoading && (
          <div className="text-gray-500">Loading metrics...</div>
        )}
        {!metricsLoading && !metrics && (
          <div className="text-gray-500">
            Metrics only available when server is running
          </div>
        )}
        {metrics && <ServerMetrics metrics={metrics} />}
      </Card>

      {/* Server Info */}
      <Card title="Server Info">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-gray-500">ID</dt>
            <dd className="font-mono text-sm">{server.id}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Internal Address</dt>
            <dd className="font-mono text-sm">
              {server.internalAddress ?? "N/A"}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Created</dt>
            <dd className="text-sm">
              {new Date(server.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Updated</dt>
            <dd className="text-sm">
              {new Date(server.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Ports */}
      <Card title="Allocated Ports">
        {Object.keys(server.allocatedPorts).length === 0 ? (
          <p className="text-gray-500">No ports allocated</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(server.allocatedPorts).map(([name, port]) => (
              <div key={name} className="bg-gray-50 rounded p-3">
                <dt className="text-xs text-gray-500 uppercase">{name}</dt>
                <dd className="font-mono text-lg">{port}</dd>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent Jobs */}
      <Card title="Recent Jobs">
        {recentJobs.length === 0 ? (
          <p className="text-gray-500">No jobs</p>
        ) : (
          <div className="space-y-2">
            {recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
              >
                <div>
                  <span className="font-medium capitalize">{job.action}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {job.startedAt
                      ? new Date(job.startedAt).toLocaleString()
                      : "Queued"}
                  </span>
                </div>
                <JobStatusBadge status={job.status} />
              </div>
            ))}
          </div>
        )}
        <Link
          to="/jobs"
          className="block text-center text-sm text-blue-600 hover:text-blue-700 mt-4"
        >
          View all jobs &rarr;
        </Link>
      </Card>
    </div>
  );
}
