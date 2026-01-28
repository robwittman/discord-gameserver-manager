import { ServerStatus } from "../../api/client";
import { useServerActions } from "../../hooks/useServerActions";
import { Button } from "../common/Button";

interface ServerActionsProps {
  serverId: string;
  status: ServerStatus;
  compact?: boolean;
}

export function ServerActions({
  serverId,
  status,
  compact = false,
}: ServerActionsProps) {
  const { start, stop, backup, isPending } = useServerActions(serverId);

  const isRunning = status === ServerStatus.Running;
  const isStopped = status === ServerStatus.Stopped;
  const canAct = isRunning || isStopped;

  if (!canAct) return null;

  const size = compact ? "sm" : "md";

  return (
    <div className={`flex gap-2 ${compact ? "flex-wrap" : ""}`}>
      {isStopped && (
        <Button
          variant="success"
          size={size}
          onClick={start}
          disabled={isPending}
        >
          {isPending ? "..." : "Start"}
        </Button>
      )}

      {isRunning && (
        <>
          <Button
            variant="danger"
            size={size}
            onClick={stop}
            disabled={isPending}
          >
            {isPending ? "..." : "Stop"}
          </Button>
          <Button
            variant="secondary"
            size={size}
            onClick={backup}
            disabled={isPending}
          >
            {isPending ? "..." : "Backup"}
          </Button>
        </>
      )}
    </div>
  );
}
