// GraphLand DataTable — a thin wrapper over ReUI's DataGrid with our own prop
// API. Call sites import only `DataTable` and `ColumnDef` from this file; they
// never touch ReUI or @tanstack/react-table directly. The wrapper is
// controlled: server-side page/sort/search are props with on*Change callbacks,
// so URL-param sync (and the router choice) stays in the page.
import {
  DataGrid,
  DataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable, DataGridTableRowSelect, DataGridTableRowSelectAll } from "@/components/reui/data-grid/data-grid-table";
import {
  sortParamToSortingState,
  sortingStateToSortParam,
} from "@/components/table/table-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef as TanstackColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
  type Table,
  type Updater,
} from "@tanstack/react-table";
import { RefreshCw, Search, Settings2 } from "lucide-react";
import * as React from "react";

/** GraphLand column definition. Maps to a native TanStack column internally. */
export interface ColumnDef<T> {
  /** Field path ("name", "user.name") or a value getter. */
  accessor: string | ((row: T) => unknown);
  title: string;
  sortable?: boolean;
  /** Backend sort key. Defaults to the string accessor; required when accessor is a function and the column is sortable. */
  sortKey?: string;
  cell?: (props: { row: T; value: unknown }) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: number;
  /** Allow hiding via the columns dropdown (default true). */
  hideable?: boolean;
}

/** Escape hatch: ReUI tableLayout flags (resizable, pinnable, sticky, dense, ...). */
export type TableLayout = NonNullable<
  React.ComponentProps<typeof DataGrid>["tableLayout"]
>;

export interface DataTableProps<T extends object> {
  columns: ColumnDef<T>[];
  data: T[];
  getRowId: (row: T) => string;

  // Server-side state (controlled)
  totalCount: number;
  totalPages: number;
  /** 1-indexed current page. */
  page: number;
  pageSize: number;
  onPaginationChange: (page: number, pageSize: number) => void;
  /** Sort param as "key:asc" | "key:desc". */
  sort?: string;
  onSortChange?: (sort: string | undefined) => void;
  searchValue?: string;
  /** Debounced 500ms internally. Omit to hide the search input. */
  onSearchChange?: (term: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void | Promise<void>;
  /** Custom filter button (usually opens a FilterSheet). */
  filterButton?: React.ReactNode;

  // UI
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Trailing actions column (Edit/Delete buttons, etc.). */
  actions?: (row: T) => React.ReactNode;
  columnsVisibility?: boolean;
  /** Extra content rendered on the left side of the toolbar. */
  toolbar?: React.ReactNode;
  tableLayout?: TableLayout;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (selection: RowSelectionState) => void;
}

function getCellValue<T>(row: T, accessor: ColumnDef<T>["accessor"]): unknown {
  if (typeof accessor === "function") return accessor(row);
  // biome-ignore lint/suspicious/noExplicitAny: nested path lookup
  let value: any = row;
  for (const key of accessor.split(".")) value = value?.[key];
  return value;
}

function alignClass(align?: ColumnDef<unknown>["align"]) {
  if (align === "right") return "text-right rtl:text-left";
  if (align === "center") return "text-center";
  return undefined;
}

// T extends object to satisfy ReUI's DataGrid<TData extends object>.
export function DataTable<T extends object>({
  columns,
  data,
  getRowId,
  totalCount,
  totalPages,
  page,
  pageSize,
  onPaginationChange,
  sort,
  onSortChange,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onRefresh,
  filterButton,
  loading = false,
  emptyMessage = "No data available",
  onRowClick,
  actions,
  columnsVisibility = true,
  toolbar,
  tableLayout,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
}: DataTableProps<T>) {
  const tanstackColumns = React.useMemo<TanstackColumnDef<T>[]>(() => {
    const cols: TanstackColumnDef<T>[] = [];

    if (enableRowSelection) {
      cols.push({
        id: "select",
        enableSorting: false,
        enableHiding: false,
        size: 40,
        meta: { headerTitle: "Select", headerClassName: "w-10", cellClassName: "w-10" },
        header: () => <DataGridTableRowSelectAll />,
        cell: ({ row }) => <DataGridTableRowSelect row={row} />,
      });
    }

    const dataCols: TanstackColumnDef<T>[] = columns.map((col) => {
      const id =
        col.sortKey ??
        (typeof col.accessor === "string" ? col.accessor : col.title);
      const headerClassName = alignClass(col.align);
      const cellClassName = alignClass(col.align);
      return {
        id,
        accessorFn: (row: T) => getCellValue(row, col.accessor),
        enableSorting: col.sortable ?? false,
        enableHiding: col.hideable ?? true,
        size: col.width,
        meta: { headerTitle: col.title, headerClassName, cellClassName },
        header: col.sortable
          ? ({ column }) => (
              <DataGridColumnHeader column={column} title={col.title} />
            )
          : col.title,
        cell: ({ row }) => {
          const value = getCellValue(row.original, col.accessor);
          return col.cell
            ? col.cell({ row: row.original, value })
            : ((value ?? "") as React.ReactNode);
        },
      };
    });
    cols.push(...dataCols);

    if (actions) {
      cols.push({
        id: "actions",
        enableSorting: false,
        enableHiding: false,
        size: 1,
        meta: { headerClassName: "text-right", cellClassName: "text-right" },
        header: "",
        cell: ({ row }) => actions(row.original),
      });
    }
    return cols;
  }, [columns, actions, enableRowSelection]);

  const sorting = React.useMemo(() => sortParamToSortingState(sort), [sort]);
  const pagination = React.useMemo<PaginationState>(
    () => ({ pageIndex: page - 1, pageSize }),
    [page, pageSize],
  );

  const handleSortingChange = (updater: Updater<SortingState>) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    onSortChange?.(sortingStateToSortParam(next));
  };

  const handlePaginationChange = (updater: Updater<PaginationState>) => {
    const next = typeof updater === "function" ? updater(pagination) : updater;
    onPaginationChange(next.pageIndex + 1, next.pageSize);
  };

  const handleRowSelectionChange = (updater: Updater<RowSelectionState>) => {
    if (!onRowSelectionChange) return;
    const current = rowSelection ?? {};
    const next = typeof updater === "function" ? updater(current) : updater;
    onRowSelectionChange(next);
  };

  const table = useReactTable({
    columns: tanstackColumns,
    data,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    enableRowSelection,
    manualSorting: true,
    manualPagination: true,
    pageCount: totalPages,
    state: {
      sorting,
      pagination,
      ...(enableRowSelection ? { rowSelection: rowSelection ?? {} } : {}),
    },
    onSortingChange: handleSortingChange,
    onPaginationChange: handlePaginationChange,
    onRowSelectionChange: enableRowSelection ? handleRowSelectionChange : undefined,
  });

  return (
    <DataGrid
      table={table}
      recordCount={totalCount}
      isLoading={loading}
      loadingMode="skeleton"
      emptyMessage={emptyMessage}
      onRowClick={onRowClick}
      tableLayout={{ columnsVisibility, ...tableLayout }}
    >
      <div className="w-full space-y-2.5">
        <DataTableToolbar
          table={table}
          searchValue={searchValue}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          onRefresh={onRefresh}
          filterButton={filterButton}
          columnsVisibility={columnsVisibility}
        >
          {toolbar}
        </DataTableToolbar>
        <DataGridContainer>
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        </DataGridContainer>
        <DataGridPagination />
      </div>
    </DataGrid>
  );
}

interface DataTableToolbarProps<T extends object> {
  table: Table<T>;
  searchValue?: string;
  onSearchChange?: (term: string) => void;
  searchPlaceholder?: string;
  onRefresh?: () => void | Promise<void>;
  filterButton?: React.ReactNode;
  columnsVisibility?: boolean;
  children?: React.ReactNode;
}

/** Toolbar: debounced search (500ms typing-guard), refresh, filter slot, columns. */
function DataTableToolbar<T extends object>({
  table,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  onRefresh,
  filterButton,
  columnsVisibility = true,
  children,
}: DataTableToolbarProps<T>) {
  const [searchTerm, setSearchTerm] = React.useState(searchValue || "");
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isUserTypingRef = React.useRef(false);

  // Sync controlled value from parent (only when the user isn't mid-type)
  React.useEffect(() => {
    if (
      searchValue !== undefined &&
      searchValue !== searchTerm &&
      !isUserTypingRef.current
    ) {
      setSearchTerm(searchValue);
    }
  }, [searchValue, searchTerm]);

  // Debounce — only fire on user typing, not when syncing from props
  React.useEffect(() => {
    if (!onSearchChange || !isUserTypingRef.current) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      onSearchChange(searchTerm);
      isUserTypingRef.current = false;
    }, 500);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [searchTerm, onSearchChange]);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasLeft = !!onSearchChange || !!children;
  const hasRight = !!filterButton || !!onRefresh || columnsVisibility;
  if (!hasLeft && !hasRight) return null;

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {onSearchChange && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => {
                isUserTypingRef.current = true;
                setSearchTerm(e.target.value);
              }}
              placeholder={searchPlaceholder}
              className="w-64 pl-8"
            />
          </div>
        )}
        {children}
      </div>
      <div className="flex items-center gap-2">
        {filterButton}
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
        )}
        {columnsVisibility && (
          <DataGridColumnVisibility
            table={table}
            trigger={
              <Button variant="outline" size="sm">
                <Settings2 className="mr-2 h-4 w-4" />
                Columns
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
