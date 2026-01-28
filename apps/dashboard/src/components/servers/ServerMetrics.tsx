import { ServerMetrics as Metrics } from "../../api/client";

interface ServerMetricsProps {
  metrics: Metrics;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function MetricGauge({
  label,
  value,
  percent,
  detail,
}: {
  label: string;
  value: string;
  percent: number;
  detail?: string;
}) {
  const getColorClass = (pct: number) => {
    if (pct >= 90) return "bg-red-500";
    if (pct >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-semibold text-gray-900">{value}</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${getColorClass(percent)}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      {detail && (
        <p className="text-xs text-gray-500 mt-1">{detail}</p>
      )}
    </div>
  );
}

export function ServerMetrics({ metrics }: ServerMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricGauge
        label="CPU"
        value={`${metrics.cpu.usage.toFixed(1)}%`}
        percent={metrics.cpu.usage}
        detail={`${metrics.cpu.cores} cores`}
      />
      <MetricGauge
        label="Memory"
        value={`${metrics.memory.percent.toFixed(1)}%`}
        percent={metrics.memory.percent}
        detail={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
      />
      <MetricGauge
        label="Disk"
        value={`${metrics.disk.percent.toFixed(1)}%`}
        percent={metrics.disk.percent}
        detail={`${formatBytes(metrics.disk.used)} / ${formatBytes(metrics.disk.total)}`}
      />
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Uptime</span>
          <span className="text-sm font-semibold text-gray-900">
            {formatUptime(metrics.uptime)}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Since {new Date(Date.now() - metrics.uptime * 1000).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
