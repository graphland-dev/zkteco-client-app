import { DataTable, type ColumnDef } from "@/components/table/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { useConfirmation } from "@/hooks/use-confirm";
import { useUsersSearchParams } from "@/hooks/use-url-search-params";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { Download, Edit, History, Plus, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { UserFormSheet } from "./~components/user-form-sheet";
import { UserImportMapperDialog } from "./~components/user-import-mapper-dialog";
import { UserPunchesSheet } from "./~components/user-punches-sheet";
import {
  createDeviceUser,
  deleteDeviceUser,
  deleteDeviceUsers,
  exportDeviceUsersCsv,
  getMutationErrorMessage,
  importDeviceUsers,
  listDeviceUsers,
  paginateDeviceUsers,
  roleLabel,
  toCreatePayload,
  toUpdatePayload,
  type DeviceUser,
  type UserFormValues,
  updateDeviceUser,
} from "./~util";

interface UsersPageProps {
  connected: boolean;
}

export function UsersPage({ connected }: UsersPageProps) {
  const { sp, patch } = useUsersSearchParams();
  const queryClient = useQueryClient();
  const { trigger: confirm } = useConfirmation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DeviceUser | null>(null);
  const [punchesUser, setPunchesUser] = useState<DeviceUser | null>(null);
  const [isPunchesSheetOpen, setIsPunchesSheetOpen] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importCsv, setImportCsv] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | undefined>();
  const [isImportMapperOpen, setIsImportMapperOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const getUserRowId = (user: DeviceUser) => `${user.userId}-${user.uid}`;

  const usersQuery = useQuery({
    queryKey: ["device-users"],
    queryFn: listDeviceUsers,
    enabled: connected,
  });

  const allUsers = usersQuery.data ?? [];
  const paged = useMemo(
    () => paginateDeviceUsers(allUsers, sp),
    [allUsers, sp],
  );

  const createMutation = useMutation({
    mutationFn: (values: UserFormValues) => createDeviceUser(toCreatePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-users"] });
      setIsSheetOpen(false);
      setEditingUser(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, values }: { userId: string; values: UserFormValues }) =>
      updateDeviceUser(userId, toUpdatePayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-users"] });
      setIsSheetOpen(false);
      setEditingUser(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDeviceUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-users"] });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (userIds: string[]) => deleteDeviceUsers(userIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-users"] });
      setRowSelection({});
    },
  });

  const selectedUsers = useMemo(() => {
    const selectedIds = new Set(
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([rowId]) => rowId),
    );
    return allUsers.filter((user) => selectedIds.has(getUserRowId(user)));
  }, [allUsers, rowSelection]);

  const importMutation = useMutation({
    mutationFn: ({ csv, updateExisting }: { csv: string; updateExisting: boolean }) =>
      importDeviceUsers(csv, updateExisting),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["device-users"] });
      setImportMessage(
        `Import finished — created ${result.created}, updated ${result.updated}, skipped ${result.skipped}, failed ${result.failed}.`,
      );
      setIsImportMapperOpen(false);
      setImportCsv(null);
      setImportFileName(undefined);
    },
  });

  const handleDelete = (user: DeviceUser) => {
    confirm({
      title: "Delete user",
      description: `Are you sure you want to delete user ${user.userId}? This cannot be undone.`,
      confirmText: "Delete",
      onConfirm: () =>
        deleteMutation.mutate(user.userId, {
          onSuccess: () => {
            setRowSelection((current) => {
              const next = { ...current };
              delete next[getUserRowId(user)];
              return next;
            });
          },
        }),
    });
  };

  const handleBulkDelete = () => {
    if (selectedUsers.length === 0) return;
    const count = selectedUsers.length;
    const preview = selectedUsers
      .slice(0, 5)
      .map((user) => user.userId)
      .join(", ");
    const suffix =
      count > 5 ? ` and ${count - 5} more` : "";

    confirm({
      title: `Delete ${count} user${count === 1 ? "" : "s"}`,
      description: `Are you sure you want to delete ${count} selected user${count === 1 ? "" : "s"} (${preview}${suffix})? This cannot be undone.`,
      confirmText: "Delete",
      onConfirm: () =>
        bulkDeleteMutation.mutate(selectedUsers.map((user) => user.userId)),
    });
  };

  const columns = useMemo<ColumnDef<DeviceUser>[]>(
    () => [
      {
        accessor: "userId",
        title: "User ID",
        sortable: true,
        cell: ({ row }) => <span className="font-medium font-mono">{row.userId}</span>,
      },
      {
        accessor: "name",
        title: "Name",
        sortable: true,
      },
      {
        accessor: "uid",
        title: "UID",
        sortable: true,
        cell: ({ row }) => <span className="font-mono">{row.uid}</span>,
      },
      {
        accessor: "role",
        title: "Role",
        sortable: true,
        cell: ({ row }) => roleLabel(row.role),
      },
      {
        accessor: "cardno",
        title: "Card",
        sortable: true,
        cell: ({ row }) => row.cardno ?? "—",
      },
      {
        accessor: "fingerprintCount",
        title: "Fingerprints",
        sortable: true,
        cell: ({ row }) => {
          const count = row.fingerprintCount ?? 0;
          if (count === 0) return "—";
          const labels =
            row.fingerprintIndices?.map((index) => index + 1).join(", ") ?? String(count);
          return (
            <span className="font-mono" title={`Finger ${labels}`}>
              {count}
            </span>
          );
        },
      },
    ],
    [],
  );

  const formError =
    getMutationErrorMessage(createMutation.error) ??
    getMutationErrorMessage(updateMutation.error);

  if (!connected) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader
          title="User management"
          subtitle="Connect to the device to list, create, update, delete, or import users."
        />
        <Alert>
          <AlertTitle>Device not connected</AlertTitle>
          <AlertDescription>Go to the Device tab and click Connect first.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="User management"
        subtitle={`${allUsers.length} users on device`}
        Action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditingUser(null);
                setIsSheetOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              New user
            </Button>
            <Button
              variant="outline"
              disabled={allUsers.length === 0}
              onClick={() => exportDeviceUsersCsv(allUsers)}
            >
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              disabled={importMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-1 h-4 w-4" />
              {importMutation.isPending ? "Importing..." : "Import CSV"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                file.text().then((csv) => {
                  setImportCsv(csv);
                  setImportFileName(file.name);
                  setIsImportMapperOpen(true);
                });
              }}
            />
          </div>
        }
      />

      <div className="flex items-center gap-2">
        <Checkbox
          id="update-existing"
          checked={updateExisting}
          onCheckedChange={(checked) => setUpdateExisting(checked === true)}
        />
        <Label htmlFor="update-existing">Update existing users when importing CSV</Label>
      </div>

      {importMessage ? (
        <Alert>
          <AlertTitle>Import result</AlertTitle>
          <AlertDescription>{importMessage}</AlertDescription>
        </Alert>
      ) : null}

      {importMutation.error ? (
        <Alert variant="destructive">
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>{getMutationErrorMessage(importMutation.error)}</AlertDescription>
        </Alert>
      ) : null}

      <UserFormSheet
        open={isSheetOpen}
        onOpenChange={(open) => {
          setIsSheetOpen(open);
          if (!open) setEditingUser(null);
        }}
        user={editingUser}
        onSubmit={async (values) => {
          if (editingUser) {
            await updateMutation.mutateAsync({ userId: editingUser.userId, values });
          } else {
            await createMutation.mutateAsync(values);
          }
        }}
        isLoading={createMutation.isPending || updateMutation.isPending}
        error={formError}
      />

      <UserImportMapperDialog
        open={isImportMapperOpen}
        onOpenChange={(open) => {
          setIsImportMapperOpen(open);
          if (!open) {
            setImportCsv(null);
            setImportFileName(undefined);
          }
        }}
        csv={importCsv}
        fileName={importFileName}
        isImporting={importMutation.isPending}
        onImport={(csv) => importMutation.mutate({ csv, updateExisting })}
      />

      <UserPunchesSheet
        open={isPunchesSheetOpen}
        onOpenChange={(open) => {
          setIsPunchesSheetOpen(open);
          if (!open) setPunchesUser(null);
        }}
        user={punchesUser}
      />

      <DataTable
        columns={columns}
        data={paged.nodes}
        getRowId={getUserRowId}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        loading={
          usersQuery.isLoading ||
          deleteMutation.isPending ||
          bulkDeleteMutation.isPending ||
          importMutation.isPending
        }
        toolbar={
          selectedUsers.length > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={bulkDeleteMutation.isPending}
              onClick={handleBulkDelete}
            >
              <Trash2 className="mr-1 h-4 w-4" />
              Delete selected ({selectedUsers.length})
            </Button>
          ) : null
        }
        totalCount={paged.meta.totalCount}
        totalPages={paged.meta.totalPages}
        page={paged.meta.currentPage}
        pageSize={sp.pageSize ?? 10}
        onPaginationChange={(page, pageSize) => patch({ page, pageSize })}
        sort={sp.sort}
        onSortChange={(sort) => patch({ sort, page: 1 })}
        searchValue={sp.search}
        onSearchChange={(term) => patch({ search: term || undefined, page: 1 })}
        searchPlaceholder="Search by user ID, name, or UID..."
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ["device-users"] })}
        emptyMessage="No users found. Try adjusting your search."
        actions={(row) => (
          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setPunchesUser(row);
                setIsPunchesSheetOpen(true);
              }}
            >
              <History className="mr-1 h-3 w-3" /> Punches
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={(event) => {
                event.stopPropagation();
                setEditingUser(row);
                setIsSheetOpen(true);
              }}
            >
              <Edit className="mr-1 h-3 w-3" /> Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
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

      <p className="text-sm text-muted-foreground">
        CSV columns: <code className="font-mono text-xs">userId</code>,{" "}
        <code className="font-mono text-xs">name</code>,{" "}
        <code className="font-mono text-xs">password</code>,{" "}
        <code className="font-mono text-xs">cardno</code>,{" "}
        <code className="font-mono text-xs">role</code>
      </p>
    </div>
  );
}
