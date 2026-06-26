import type { CreateUserInput, UpdateUserInput, UserRole, UserRoleName } from "@graphland/zk-client";

export interface CsvUserRow {
  userId: string;
  name: string;
  password?: string;
  cardno?: number;
  role?: UserRole;
}

export interface ImportUsersOptions {
  csv: string;
  updateExisting?: boolean;
}

export interface ImportUsersResult {
  ok: boolean;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
  durationMs: number;
}

export const CSV_HEADERS = ["userId", "name", "password", "cardno", "role"] as const;

export type UserCsvField = (typeof CSV_HEADERS)[number];

export const USER_CSV_FIELD_LABELS: Record<UserCsvField, string> = {
  userId: "User ID",
  name: "Name",
  password: "Password",
  cardno: "Card number",
  role: "Role",
};

export const USER_CSV_REQUIRED_FIELDS: UserCsvField[] = ["userId", "name"];

export interface UserCsvColumnMapping {
  userId: string | null;
  name: string | null;
  password: string | null;
  cardno: string | null;
  role: string | null;
}

export interface CsvTable {
  headers: string[];
  rows: string[][];
  hasHeaderRow: boolean;
}

const FIELD_ALIASES: Record<UserCsvField, string[]> = {
  userId: [
    "userid",
    "user_id",
    "id",
    "employeeid",
    "employee_id",
    "empid",
    "emp_id",
    "empcode",
    "emp_code",
    "employeecode",
    "employee_code",
    "badge",
    "badgenumber",
    "staffid",
    "staff_id",
    "code",
  ],
  name: [
    "name",
    "fullname",
    "full_name",
    "displayname",
    "display_name",
    "employee",
    "employeename",
    "employee_name",
    "empname",
    "emp_name",
    "firstname",
    "first_name",
    "lastname",
    "last_name",
  ],
  password: ["password", "pass", "pin", "pincode"],
  cardno: ["cardno", "card", "cardnumber", "card_no", "card_number"],
  role: ["role", "privilege", "access", "usertype", "user_type"],
};

const HEADER_HINT_ALIASES = [
  ...new Set(Object.values(FIELD_ALIASES).flat()),
  "email",
  "department",
  "dept",
  "phone",
  "mobile",
  "address",
  "title",
  "position",
  "job",
  "status",
  "active",
  "created",
  "updated",
  "gender",
  "dob",
  "birthdate",
];

function normalizeMappingKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function createEmptyColumnMapping(): UserCsvColumnMapping {
  return {
    userId: null,
    name: null,
    password: null,
    cardno: null,
    role: null,
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values;
}

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function looksLikeHeaderCell(cell: string): boolean {
  const trimmed = cell.trim();
  if (!trimmed) return false;
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return false;
  return /[a-zA-Z]/.test(trimmed);
}

function countNumericCells(cells: string[]): number {
  return cells.filter((cell) => /^\d+([.,]\d+)?$/.test(cell.trim())).length;
}

function isHeaderRow(cells: string[], dataRow?: string[]): boolean {
  if (cells.length === 0) return false;

  const normalized = cells.map(normalizeMappingKey);
  if (normalized.some((cell) => HEADER_HINT_ALIASES.includes(cell))) return true;

  const labelLikeCount = cells.filter(looksLikeHeaderCell).length;
  if (labelLikeCount === cells.length && cells.length > 1) return true;
  if (labelLikeCount < Math.ceil(cells.length / 2)) return false;

  if (!dataRow || dataRow.length === 0) {
    return labelLikeCount === cells.length;
  }

  return countNumericCells(dataRow) > countNumericCells(cells);
}

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase().replace(/\s+/g, "");
  if (key === "userid" || key === "user_id" || key === "id") return "userId";
  if (key === "cardno" || key === "card" || key === "cardnumber") return "cardno";
  return header.trim();
}

function parseRole(raw?: string): UserRole | undefined {
  if (!raw?.trim()) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "user" || value === "enroller" || value === "admin" || value === "superadmin") {
    return value as UserRoleName;
  }
  const num = Number(value);
  return Number.isNaN(num) ? undefined : num;
}

export function parseCsvTable(csv: string): CsvTable {
  const normalizedCsv = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const lines = normalizedCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [], hasHeaderRow: false };
  }

  const firstCells = parseCsvLine(lines[0]!);
  const secondCells = lines.length > 1 ? parseCsvLine(lines[1]!) : undefined;
  if (isHeaderRow(firstCells, secondCells)) {
    return {
      headers: firstCells,
      rows: lines.slice(1).map((line) => parseCsvLine(line)),
      hasHeaderRow: true,
    };
  }

  const columnCount = Math.max(...lines.map((line) => parseCsvLine(line).length), 1);
  const headers = Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);

  return {
    headers,
    rows: lines.map((line) => parseCsvLine(line)),
    hasHeaderRow: false,
  };
}

export function suggestColumnMapping(headers: string[]): UserCsvColumnMapping {
  const mapping = createEmptyColumnMapping();
  const used = new Set<string>();

  for (const field of CSV_HEADERS) {
    const aliases = FIELD_ALIASES[field];
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const normalized = normalizeMappingKey(header);
      return (
        aliases.includes(normalized) ||
        normalizeHeader(header) === field ||
        aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
      );
    });
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }

  return mapping;
}

function getMappedCell(
  cells: string[],
  headers: string[],
  sourceColumn: string | null,
): string {
  if (!sourceColumn) return "";
  const index = headers.indexOf(sourceColumn);
  if (index < 0) return "";
  return (cells[index] ?? "").trim();
}

export function parseUsersCsvWithMapping(
  table: CsvTable,
  mapping: UserCsvColumnMapping,
): CsvUserRow[] {
  const rows: CsvUserRow[] = [];

  for (const cells of table.rows) {
    const userId = getMappedCell(cells, table.headers, mapping.userId);
    const name = getMappedCell(cells, table.headers, mapping.name);
    if (!userId || !name) continue;

    const password = getMappedCell(cells, table.headers, mapping.password) || undefined;
    const cardRaw = getMappedCell(cells, table.headers, mapping.cardno);
    const cardno = cardRaw ? Number(cardRaw) : undefined;
    const roleRaw = getMappedCell(cells, table.headers, mapping.role);

    rows.push({
      userId,
      name,
      password,
      cardno: cardno !== undefined && !Number.isNaN(cardno) ? cardno : undefined,
      role: parseRole(roleRaw),
    });
  }

  return rows;
}

export function rowsToImportCsv(rows: CsvUserRow[]): string {
  return usersToCsv(rows);
}

export function parseUsersCsv(csv: string): CsvUserRow[] {
  const table = parseCsvTable(csv);
  if (table.headers.length === 0) return [];
  const mapping = suggestColumnMapping(table.headers);
  return parseUsersCsvWithMapping(table, mapping);
}

export function usersToCsv(users: Array<{
  userId: string;
  name: string;
  password?: string;
  cardno?: number;
  role?: number | string;
}>): string {
  const lines = [
    CSV_HEADERS.join(","),
    ...users.map((user) =>
      [
        escapeCsvValue(String(user.userId)),
        escapeCsvValue(user.name),
        escapeCsvValue(user.password ?? ""),
        user.cardno !== undefined ? String(user.cardno) : "",
        user.role !== undefined ? String(user.role) : "",
      ].join(","),
    ),
  ];
  return lines.join("\n");
}

export function toCreateUserInput(row: CsvUserRow): CreateUserInput {
  return {
    userId: row.userId,
    name: row.name,
    password: row.password,
    cardno: row.cardno,
    role: row.role,
  };
}

export function toUpdateUserInput(row: CsvUserRow): UpdateUserInput {
  return {
    name: row.name,
    password: row.password,
    cardno: row.cardno,
    role: row.role,
  };
}
