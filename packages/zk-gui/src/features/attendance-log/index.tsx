import { clearAttendanceLog, getStatus } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirmation } from "@/hooks/use-confirm";
import { getMutationErrorMessage } from "@/features/users/~util";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser } from "lucide-react";
import type { WebhookStatus } from "@/types";

interface AttendanceLogPageProps {
  connected: boolean;
}

function WebhookStats({ webhook }: { webhook: WebhookStatus }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border bg-card p-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Passes sent
        </dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums">{webhook.passesForwarded}</dd>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Webhook
        </dt>
        <dd className="mt-1 text-sm font-medium">
          {webhook.listening ? "Listening" : "Configured"}
        </dd>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last delivery
        </dt>
        <dd className="mt-1 text-sm font-medium">
          {webhook.lastDeliveredAt
            ? new Date(webhook.lastDeliveredAt).toLocaleString()
            : "—"}
        </dd>
      </div>
    </dl>
  );
}

export function AttendanceLogPage({ connected }: AttendanceLogPageProps) {
  const queryClient = useQueryClient();
  const { trigger: confirm } = useConfirmation();

  const statusQuery = useQuery({
    queryKey: ["connection-status"],
    queryFn: getStatus,
    enabled: connected,
    refetchInterval: connected ? 2000 : false,
  });

  const clearMutation = useMutation({
    mutationFn: clearAttendanceLog,
    onSuccess: (status) => {
      queryClient.setQueryData(["connection-status"], status);
    },
  });

  const webhook = statusQuery.data?.webhook;
  const hasLogEntries = (webhook?.recentPasses.length ?? 0) > 0 || (webhook?.passesForwarded ?? 0) > 0;

  const handleClearLog = () => {
    confirm({
      title: "Clear attendance log",
      description:
        "This clears the on-screen log and pass counter. It does not delete records on the device or affect the webhook.",
      confirmText: "Clear log",
      variant: "destructive",
      onConfirm: () => clearMutation.mutate(),
    });
  };

  if (!connected) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="Attendance log"
          subtitle="Live passes forwarded to your webhook."
        />
        <Alert>
          <AlertTitle>Device not connected</AlertTitle>
          <AlertDescription>Go to the Device tab and click Connect first.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!webhook?.enabled) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="Attendance log"
          subtitle="Live passes forwarded to your webhook."
        />
        <Alert>
          <AlertTitle>Webhook not configured</AlertTitle>
          <AlertDescription>
            Set a webhook URL on the Device tab to start forwarding attendance passes.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Attendance log"
        subtitle="Live passes forwarded to your webhook."
        Action={
          <Button
            variant="outline"
            disabled={!hasLogEntries || clearMutation.isPending}
            onClick={handleClearLog}
          >
            <Eraser className="mr-1 h-4 w-4" />
            {clearMutation.isPending ? "Clearing…" : "Clear log"}
          </Button>
        }
      />

      <WebhookStats webhook={webhook} />

      <p className="font-mono text-xs text-muted-foreground break-all">{webhook.url}</p>

      {webhook.lastError ? (
        <Alert variant="destructive">
          <AlertTitle>Webhook error</AlertTitle>
          <AlertDescription>{webhook.lastError}</AlertDescription>
        </Alert>
      ) : null}

      {clearMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to clear log</AlertTitle>
          <AlertDescription>{getMutationErrorMessage(clearMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      {webhook.recentPasses.length > 0 ? (
        <ul className="pass-list">
          {webhook.recentPasses.map((pass, index) => (
            <li
              key={`${pass.attTime}-${pass.userId}-${index}`}
              className={pass.delivered ? "ok" : "fail"}
            >
              <span className="pass-user">{String(pass.userId)}</span>
              <span className="pass-time">{new Date(pass.attTime).toLocaleString()}</span>
              <span className="pass-state">{pass.delivered ? "Sent" : "Failed"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Waiting for the next pass on the device…</p>
      )}
    </div>
  );
}
