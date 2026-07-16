import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { DeviceUser } from "@/types";
import { useEffect, useMemo, useState } from "react";
import {
  previewUsersForPortalSync,
  syncUserToPortal,
  type ConflictKeepSide,
  type UserSyncOutcome,
  type UserSyncPreview,
} from "../~portal-sync";

interface UserSyncSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: DeviceUser[];
  /** When keeping portal values, update the local/device user to match. */
  onApplyPortalValues?: (fromUserId: string, portal: { userId: string; name: string }) => Promise<void>;
}

function statusLabel(status: UserSyncPreview["status"]): string {
  switch (status) {
    case "new":
      return "New";
    case "skip":
      return "Already synced";
    case "conflict":
      return "Conflict";
  }
}

function statusClass(status: UserSyncPreview["status"]): string {
  switch (status) {
    case "new":
      return "text-emerald-700";
    case "skip":
      return "text-muted-foreground";
    case "conflict":
      return "text-destructive";
  }
}

export function UserSyncSheet({
  open,
  onOpenChange,
  users,
  onApplyPortalValues,
}: UserSyncSheetProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<UserSyncPreview[]>([]);
  const [keepSide, setKeepSide] = useState<ConflictKeepSide | null>(null);
  const [outcome, setOutcome] = useState<(UserSyncOutcome & { applyToDevice?: { userId: string; name: string } }) | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOutcome(null);
    setKeepSide(null);
    setError(null);
    setIsPosting(false);
    const next = previewUsersForPortalSync(users);
    setPreviews(next);
    setSelectedUserId((current) => {
      if (current && next.some((row) => row.user.userId === current)) return current;
      return next[0]?.user.userId ?? null;
    });
  }, [open, users]);

  const selected = useMemo(
    () => previews.find((row) => row.user.userId === selectedUserId) ?? null,
    [previews, selectedUserId],
  );

  const needsConflictChoice = selected?.status === "conflict";

  const handleSync = async () => {
    if (!selected) return;
    if (needsConflictChoice && !keepSide) {
      setError("Choose which record to keep before posting.");
      return;
    }

    setIsPosting(true);
    setError(null);
    try {
      const result = syncUserToPortal(selected.user, {
        keep: needsConflictChoice ? keepSide ?? undefined : undefined,
      });

      if (result.applyToDevice && onApplyPortalValues) {
        await onApplyPortalValues(selected.user.userId, result.applyToDevice);
      }

      setOutcome(result);
      setPreviews(previewUsersForPortalSync(users));
      setKeepSide(null);
      if (result.applyToDevice) {
        setSelectedUserId(result.applyToDevice.userId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-4 overflow-hidden p-4 data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="p-0">
          <SheetTitle>Sync user to portal</SheetTitle>
          <SheetDescription>
            Select one user, then post to sync. On conflict, choose which id and name both sides
            should keep.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {previews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users to sync.</p>
          ) : (
            <ul className="space-y-2">
              {previews.map((row) => {
                const checked = row.user.userId === selectedUserId;
                return (
                  <li key={`${row.user.userId}-${row.user.name}`}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        checked ? "border-foreground/40 bg-muted/40" : "hover:bg-muted/20",
                      )}
                    >
                      <input
                        type="radio"
                        name="portal-sync-user"
                        className="mt-1"
                        checked={checked}
                        onChange={() => {
                          setSelectedUserId(row.user.userId);
                          setOutcome(null);
                          setKeepSide(null);
                          setError(null);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{row.user.name}</span>
                          <span className={cn("text-xs font-medium", statusClass(row.status))}>
                            {statusLabel(row.status)}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          ID: {row.user.userId}
                        </div>
                        {row.status === "conflict" && row.portalUser ? (
                          <div className="mt-1 text-xs text-destructive">
                            {row.conflictKind === "id_mismatch"
                              ? `Portal uses the same name under ID ${row.portalUser.userId}`
                              : `Portal name for this ID: ${row.portalUser.name}`}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {needsConflictChoice && selected?.portalUser ? (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <div>
                <h3 className="text-sm font-medium">Conflict — which one should both keep?</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  After sync, device and portal will share the same ID and the same name.
                </p>
              </div>

              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3",
                  keepSide === "device" ? "border-foreground/40" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="portal-sync-keep"
                  className="mt-1"
                  checked={keepSide === "device"}
                  onChange={() => setKeepSide("device")}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Keep device</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    ID {selected.user.userId} · {selected.user.name}
                  </div>
                </div>
              </label>

              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-3",
                  keepSide === "portal" ? "border-foreground/40" : "border-border",
                )}
              >
                <input
                  type="radio"
                  name="portal-sync-keep"
                  className="mt-1"
                  checked={keepSide === "portal"}
                  onChange={() => setKeepSide("portal")}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Keep portal</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    ID {selected.portalUser.userId} · {selected.portalUser.name}
                  </div>
                </div>
              </label>
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>Cannot sync</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {outcome ? (
            <Alert>
              <AlertTitle>
                {outcome.status === "new"
                  ? "Synced"
                  : outcome.status === "resolved"
                    ? "Conflict resolved"
                    : "Skipped"}
              </AlertTitle>
              <AlertDescription>
                <span className="font-mono">{outcome.userId}</span> — {outcome.message}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <SheetFooter className="mt-0 flex flex-col gap-2 p-0">
          <Button
            type="button"
            disabled={!selected || isPosting || (needsConflictChoice && !keepSide)}
            onClick={() => void handleSync()}
          >
            {isPosting
              ? "Posting…"
              : needsConflictChoice
                ? "Resolve & sync"
                : "Post & sync selected"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
