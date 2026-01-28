import { Link } from "react-router-dom";
import { ServerInstance, ServerStatus } from "../../api/client";
import { Card } from "../common/Card";
import { ServerStatusBadge } from "../common/StatusBadge";
import { ServerActions } from "./ServerActions";

interface ServerCardProps {
  server: ServerInstance;
}

export function ServerCard({ server }: ServerCardProps) {
  const mainPort = Object.entries(server.allocatedPorts)[0];

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Link
            to={`/servers/${server.id}`}
            className="text-lg font-semibold text-gray-900 hover:text-blue-600"
          >
            {server.name}
          </Link>
          <p className="text-sm text-gray-500 mt-1">{server.gameId}</p>
        </div>
        <ServerStatusBadge status={server.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Port:</span>{" "}
          <span className="font-mono">
            {mainPort ? mainPort[1] : "N/A"}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Internal IP:</span>{" "}
          <span className="font-mono text-xs">
            {server.internalAddress || "N/A"}
          </span>
        </div>
      </div>

      {(server.status === ServerStatus.Running ||
        server.status === ServerStatus.Stopped) && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <ServerActions serverId={server.id} status={server.status} compact />
        </div>
      )}
    </Card>
  );
}
