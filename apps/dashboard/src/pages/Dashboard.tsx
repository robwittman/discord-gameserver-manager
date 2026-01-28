import { useServers } from "../hooks/useServers";
import { useStats } from "../hooks/useStats";
import { ServerCard } from "../components/servers/ServerCard";
import { Card } from "../components/common/Card";

export default function Dashboard() {
  const { data: servers, isLoading: serversLoading, error: serversError } = useServers();
  const { data: stats, isLoading: statsLoading } = useStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Manage your game servers</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {statsLoading ? "-" : servers?.length ?? 0}
            </p>
            <p className="text-sm text-gray-500">Servers</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {statsLoading ? "-" : stats?.ports.available ?? 0}
            </p>
            <p className="text-sm text-gray-500">Available Ports</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">
              {statsLoading ? "-" : stats?.jobRunner.activeJobs ?? 0}
            </p>
            <p className="text-sm text-gray-500">Active Jobs</p>
          </div>
        </Card>
      </div>

      {/* Server list */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Servers</h2>
        {serversLoading && (
          <div className="text-center py-8 text-gray-500">Loading servers...</div>
        )}
        {serversError && (
          <div className="text-center py-8 text-red-500">
            Failed to load servers: {serversError.message}
          </div>
        )}
        {servers && servers.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No servers found. Create one using the CLI or Discord bot.
          </div>
        )}
        {servers && servers.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
