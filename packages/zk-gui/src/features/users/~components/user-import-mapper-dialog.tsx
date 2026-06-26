import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  CSV_HEADERS,
  parseCsvTable,
  parseUsersCsvWithMapping,
  rowsToImportCsv,
  suggestColumnMapping,
  USER_CSV_FIELD_LABELS,
  USER_CSV_REQUIRED_FIELDS,
  type UserCsvColumnMapping,
  type UserCsvField,
} from "@/user-csv";
import { useEffect, useMemo, useState } from "react";

const SKIP_VALUE = "__skip__";

interface UserImportMapperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  csv: string | null;
  fileName?: string;
  onImport: (csv: string) => void;
  isImporting?: boolean;
}

export function UserImportMapperDialog({
  open,
  onOpenChange,
  csv,
  fileName,
  onImport,
  isImporting = false,
}: UserImportMapperDialogProps) {
  const table = useMemo(() => (csv ? parseCsvTable(csv) : null), [csv]);

  const [mapping, setMapping] = useState<UserCsvColumnMapping>(() =>
    suggestColumnMapping([]),
  );

  useEffect(() => {
    if (open && table) {
      setMapping(suggestColumnMapping(table.headers));
    }
  }, [open, table]);

  const previewRows = useMemo(() => {
    if (!table) return [];
    return parseUsersCsvWithMapping(table, mapping).slice(0, 5);
  }, [table, mapping]);

  const validRowCount = useMemo(() => {
    if (!table) return 0;
    return parseUsersCsvWithMapping(table, mapping).length;
  }, [table, mapping]);

  const missingRequired = USER_CSV_REQUIRED_FIELDS.filter((field) => !mapping[field]);

  function updateMapping(field: UserCsvField, value: string) {
    setMapping((current) => ({
      ...current,
      [field]: value === SKIP_VALUE ? null : value,
    }));
  }

  function handleImport() {
    if (!table || missingRequired.length > 0 || validRowCount === 0) return;
    const rows = parseUsersCsvWithMapping(table, mapping);
    onImport(rowsToImportCsv(rows));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 p-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Map CSV columns</DialogTitle>
          <DialogDescription>
            {fileName
              ? `Match columns from ${fileName} to user fields before importing.`
              : "Match your CSV columns to user fields before importing."}
          </DialogDescription>
        </DialogHeader>

        {!table || table.headers.length === 0 ? (
          <p className="text-sm text-muted-foreground">The selected file has no data rows.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {CSV_HEADERS.map((field) => (
                <div key={field} className="space-y-1.5">
                  <Label>
                    {USER_CSV_FIELD_LABELS[field]}
                    {USER_CSV_REQUIRED_FIELDS.includes(field) ? (
                      <span className="text-destructive"> *</span>
                    ) : null}
                  </Label>
                  <Select
                    value={mapping[field] ?? SKIP_VALUE}
                    onValueChange={(value) => {
                      if (value) updateMapping(field, value);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP_VALUE}>— Skip —</SelectItem>
                      {table.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {missingRequired.length > 0 ? (
              <p className="text-sm text-destructive">
                Map required fields:{" "}
                {missingRequired.map((field) => USER_CSV_FIELD_LABELS[field]).join(", ")}
              </p>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Preview</Label>
                <span className="text-xs text-muted-foreground">
                  {validRowCount} valid row{validRowCount === 1 ? "" : "s"}
                  {table.hasHeaderRow ? "" : " · no header row detected"}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {USER_CSV_REQUIRED_FIELDS.concat(
                        CSV_HEADERS.filter((field) => !USER_CSV_REQUIRED_FIELDS.includes(field)),
                      ).map((field) => (
                        <th key={field} className="px-3 py-2 text-left font-medium">
                          {USER_CSV_FIELD_LABELS[field]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={CSV_HEADERS.length}
                          className="px-3 py-4 text-center text-muted-foreground"
                        >
                          No valid rows with the current mapping.
                        </td>
                      </tr>
                    ) : (
                      previewRows.map((row, index) => (
                        <tr key={`${row.userId}-${index}`} className="border-b last:border-b-0">
                          <td className="px-3 py-2 font-mono">{row.userId}</td>
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2">{row.password ?? "—"}</td>
                          <td className="px-3 py-2">{row.cardno ?? "—"}</td>
                          <td className="px-3 py-2">{row.role ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className={cn("-mx-4 -mb-4")}>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={
              isImporting ||
              !table ||
              table.headers.length === 0 ||
              missingRequired.length > 0 ||
              validRowCount === 0
            }
          >
            {isImporting ? "Importing…" : `Import ${validRowCount} user${validRowCount === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
