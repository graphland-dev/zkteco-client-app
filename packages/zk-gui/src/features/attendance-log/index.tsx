import { clearAttendanceLog, getStatus } from "@/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirmation } from "@/hooks/use-confirm";
import { getMutationErrorMessage } from "@/features/users/~util";
import { DEMO_MODE_ENABLED } from "@/demo/config";
import {
  loadAttendanceLog,
  mergeAttendancePasses,
  saveAttendanceLog,
  type StoredAttendancePass,
} from "@/demo/seed";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WebhookPassRecord, WebhookStatus } from "@/types";

interface AttendanceLogPageProps {
  connected: boolean;
}

function toStoredPass(
  pass: WebhookPassRecord,
  fallbackDeviceIp: string,
): StoredAttendancePass {
  const deviceIp = pass.deviceIp ?? fallbackDeviceIp;
  return {
    id: `${deviceIp}|${pass.userId}|${pass.attTime}`,
    userId: String(pass.userId),
    attTime: pass.attTime,
    deviceIp,
    delivered: pass.delivered,
    source: "live",
  };
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

function PassList({ passes }: { passes: StoredAttendancePass[] }) {
  if (passes.length === 0) {
    return <p className="text-sm text-muted-foreground">No attendance records yet.</p>;
  }

  return (
    <ul className="pass-list">
      {passes.map((pass) => (
        <li
          key={pass.id}
          className={pass.delivered === false ? "fail" : "ok"}
        >
          <span className="pass-user">
            {pass.userName ? `${pass.userName} (${pass.userId})` : String(pass.userId)}
          </span>
          <span className="pass-time">{new Date(pass.attTime).toLocaleString()}</span>
          <span className="pass-state font-mono text-xs" title="Device IP">
            {pass.deviceIp}
          </span>
          <span className="pass-state">
            {pass.source === "demo" || pass.source === "seed"
              ? "Demo"
              : pass.delivered === false
                ? "Failed"
                : "Sent"}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MachineSummary({ passes }: { passes: StoredAttendancePass[] }) {
  const byMachine = useMemo(() => {
    const map = new Map<string, number>();
    for (const pass of passes) {
      map.set(pass.deviceIp, (map.get(pass.deviceIp) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [passes]);

  if (byMachine.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {byMachine.map(([ip, count]) => (
        <div key={ip} className="rounded-lg border bg-card px-3 py-2 text-xs">
          <span className="font-mono font-medium">{ip}</span>
          <span className="ml-2 text-muted-foreground">{count} punches</span>
        </div>
      ))}
    </div>
  );
}

export function AttendanceLogPage({ connected }: AttendanceLogPageProps) {
  const queryClient = useQueryClient();
  const { trigger: confirm } = useConfirmation();
  const [storedPasses, setStoredPasses] = useState<StoredAttendancePass[]>([]);

  useEffect(() => {
    setStoredPasses(loadAttendanceLog());
  }, []);

  const statusQuery = useQuery({
    queryKey: ["connection-status"],
    queryFn: getStatus,
    enabled: connected,
    refetchInterval: connected ? 2000 : false,
  });

  const webhook = statusQuery.data?.webhook;
  const deviceIp = statusQuery.data?.config?.ip ?? "";
  const recentPassesKey =
    webhook?.recentPasses
      .map((pass) => `${pass.deviceIp ?? ""}|${pass.userId}|${pass.attTime}|${pass.delivered}`)
      .join(";") ?? "";

  useEffect(() => {
    if (!webhook?.recentPasses.length) return;
    const incoming = webhook.recentPasses.map((pass) =>
      toStoredPass(pass, deviceIp || "unknown"),
    );
    setStoredPasses((current) => {
      const merged = mergeAttendancePasses(current, incoming);
      if (merged.length === current.length && merged.every((pass, i) => pass.id === current[i]?.id)) {
        return current;
      }
      saveAttendanceLog(merged);
      return merged;
    });
  }, [recentPassesKey, deviceIp, webhook?.recentPasses]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === "gl-zkt-attendance-log") {
        setStoredPasses(loadAttendanceLog());
      }
    };
    const onDemoPunch = () => setStoredPasses(loadAttendanceLog());
    window.addEventListener("storage", onStorage);
    window.addEventListener("gl-zkt-attendance-updated", onDemoPunch);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("gl-zkt-attendance-updated", onDemoPunch);
    };
  }, []);

  const clearMutation = useMutation({
    mutationFn: clearAttendanceLog,
    onSuccess: (status) => {
      queryClient.setQueryData(["connection-status"], status);
      saveAttendanceLog([]);
      setStoredPasses([]);
    },
  });

  const hasLogEntries =
    storedPasses.length > 0 ||
    (webhook?.recentPasses.length ?? 0) > 0 ||
    (webhook?.passesForwarded ?? 0) > 0;

  const handleClearLog = () => {
    confirm({
      title: "Clear attendance log",
      description:
        "This clears the on-screen log (including previous punches from all machines). It does not delete records on the device or affect the webhook.",
      confirmText: "Clear log",
      variant: "destructive",
      onConfirm: () => {
        if (connected && webhook?.enabled) {
          clearMutation.mutate();
        } else {
          saveAttendanceLog([]);
          setStoredPasses([]);
        }
      },
    });
  };

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Attendance log"
        subtitle="Previous punches from all machines, plus new ones as they arrive."
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

      {!connected ? (
        <Alert>
          <AlertTitle>Device not connected</AlertTitle>
          <AlertDescription>
            Showing saved punches from previous sessions
            {DEMO_MODE_ENABLED ? " and demo seed data" : ""}. Connect on the Device tab for live
            passes.
          </AlertDescription>
        </Alert>
      ) : null}

      {connected && !webhook?.enabled ? (
        <Alert>
          <AlertTitle>Webhook not configured</AlertTitle>
          <AlertDescription>
            Set a webhook URL on the Device tab to forward live passes. Previous punches below still
            remain.
          </AlertDescription>
        </Alert>
      ) : null}

      {connected && webhook?.enabled ? (
        <>
          <WebhookStats webhook={webhook} />
          <p className="font-mono text-xs text-muted-foreground break-all">{webhook.url}</p>
          {webhook.lastError ? (
            <Alert variant="destructive">
              <AlertTitle>Webhook error</AlertTitle>
              <AlertDescription>{webhook.lastError}</AlertDescription>
            </Alert>
          ) : null}
        </>
      ) : null}

      {clearMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Failed to clear log</AlertTitle>
          <AlertDescription>{getMutationErrorMessage(clearMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <MachineSummary passes={storedPasses} />
      <PassList passes={storedPasses} />
    </div>
  );
}
