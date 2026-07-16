import { DataTable, type ColumnDef } from "@/components/table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirmation } from "@/hooks/use-confirm";
import { formatDatePattern } from "@/lib/date-format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  deleteUserPunch,
  fetchUserPunchHistory,
  getMutationErrorMessage,
  paginatePunchRecords,
  punchRecordKey,
  type DeviceUser,
  type PunchRecord,
} from "../~util";

interface UserPunchesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: DeviceUser | null;
}

export function UserPunchesSheet({
  open,
  onOpenChange,
  user,
}: UserPunchesSheetProps) {
  const queryClient = useQueryClient();
  const { trigger: confirm } = useConfirmation();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<string | undefined>("recordTime:desc");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setPage(1);
      setSearch("");
      setSort("recordTime:desc");
    }
  }, [open, user?.userId]);

  const punchesQuery = useQuery({
    queryKey: ["device-user-punches", user?.userId],
    queryFn: () => fetchUserPunchHistory(user!.userId),
    enabled: open && Boolean(user),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUserPunch,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["device-user-punches", user?.userId],
      });
    },
  });

  const paged = useMemo(
    () =>
      paginatePunchRecords(punchesQuery.data ?? [], {
        page,
        pageSize,
        sort,
        search: search || undefined,
      }),
    [punchesQuery.data, page, pageSize, sort, search],
  );

  const columns = useMemo<ColumnDef<PunchRecord>[]>(
    () => [
      {
        accessor: "recordTime",
        title: "Time",
        sortable: true,
        cell: ({ row }) =>
          formatDatePattern(new Date(row.recordTime), "dd/MM/yyyy HH:mm"),
      },
      {
        accessor: "punchLabel",
        title: "Punch",
        sortable: true,
        cell: ({ row }) =>
          row.punch !== undefined || row.punchLabel ? "Punched" : "—",
      },
      {
        accessor: "statusLabel",
        title: "Verify",
        sortable: true,
        cell: ({ row }) => row.statusLabel ?? "—",
      },
      {
        accessor: "userSn",
        title: "Log #",
        sortable: true,
        cell: ({ row }) =>
          row.userSn !== undefined ? String(row.userSn) : "—",
      },
    ],
    [],
  );

  const handleDelete = (record: PunchRecord) => {
    const timeLabel = formatDatePattern(
      new Date(record.recordTime),
      "dd/MM/yyyy HH:mm",
    );
    confirm({
      title: "Delete punch",
      description: `Remove the punch at ${timeLabel} from the device? Other users' attendance records are preserved.`,
      confirmText: "Delete punch",
      onConfirm: () => deleteMutation.mutate(record),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-4 overflow-hidden p-4 w-full max-w-2xl"
      >
        <SheetHeader className="p-0">
          <SheetTitle>Punch history{user ? ` — ${user.name}` : ""}</SheetTitle>
          <SheetDescription>
            {user
              ? `Attendance records for user ${user.userId} from the connected device.`
              : "Select a user to view punch history."}
          </SheetDescription>
        </SheetHeader>

        {punchesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">
            Downloading attendance from device…
          </p>
        ) : null}

        {punchesQuery.error ? (
          <Alert variant="destructive">
            <AlertTitle>Failed to load punches</AlertTitle>
            <AlertDescription>
              {getMutationErrorMessage(punchesQuery.error)}
            </AlertDescription>
          </Alert>
        ) : null}

        {deleteMutation.error ? (
          <Alert variant="destructive">
            <AlertTitle>Delete failed</AlertTitle>
            <AlertDescription>
              {getMutationErrorMessage(deleteMutation.error)}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="min-h-0 flex-1">
          <DataTable
            columns={columns}
            data={paged.nodes}
            getRowId={(row) => punchRecordKey(row)}
            loading={punchesQuery.isLoading || deleteMutation.isPending}
            totalCount={paged.meta.totalCount}
            totalPages={paged.meta.totalPages}
            page={paged.meta.currentPage}
            pageSize={pageSize}
            onPaginationChange={(nextPage, nextPageSize) => {
              setPage(nextPage);
              setPageSize(nextPageSize);
            }}
            sort={sort}
            onSortChange={(nextSort) => {
              setSort(nextSort);
              setPage(1);
            }}
            searchValue={search}
            onSearchChange={(term) => {
              setSearch(term);
              setPage(1);
            }}
            searchPlaceholder="Search punches…"
            onRefresh={async () => {
              await punchesQuery.refetch();
            }}
            emptyMessage={
              punchesQuery.isLoading
                ? "Loading punch history…"
                : "No punch records found for this user."
            }
            actions={(row) => (
              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(row);
                  }}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
              </div>
            )}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
