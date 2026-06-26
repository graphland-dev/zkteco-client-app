import {
  createUser as apiCreateUser,
  deleteUser as apiDeleteUser,
  deleteUserPunch as apiDeleteUserPunch,
  getUserPunchHistory as apiGetUserPunchHistory,
  importUsers as apiImportUsers,
  listUsers as apiListUsers,
  updateUser as apiUpdateUser,
} from "@/api";
import type { DeviceUser, ImportUsersResult, PunchRecord, UserWriteInput } from "@/types";
import { usersToCsv } from "@/user-csv";
import { z } from "zod";
import type { UsersSearchParams } from "@/hooks/use-url-search-params";

export type { DeviceUser };

export const USER_ROLE_OPTIONS = [
  { value: "0", label: "User" },
  { value: "1", label: "Enroller" },
  { value: "3", label: "Admin" },
  { value: "7", label: "Super admin" },
] as const;

export function roleLabel(role: number): string {
  return USER_ROLE_OPTIONS.find((option) => Number(option.value) === role)?.label ?? String(role);
}

export const userFormSchema = z.object({
  userId: z.string().trim().min(1, "User ID is required"),
  name: z.string().trim().min(1, "Name is required"),
  password: z.string().optional(),
  cardno: z.string().optional(),
  role: z.string().min(1, "Role is required"),
});

export type UserFormValues = z.infer<typeof userFormSchema>;

export function toUserFormValues(user?: DeviceUser | null): UserFormValues {
  if (!user) {
    return { userId: "", name: "", password: "", cardno: "", role: "0" };
  }
  return {
    userId: user.userId,
    name: user.name,
    password: user.password ?? "",
    cardno: user.cardno !== undefined ? String(user.cardno) : "",
    role: String(user.role),
  };
}

export function toCreatePayload(values: UserFormValues): UserWriteInput {
  const cardno = values.cardno?.trim();
  return {
    userId: values.userId.trim(),
    name: values.name.trim(),
    password: values.password?.trim() || undefined,
    cardno: cardno ? Number(cardno) : undefined,
    role: Number(values.role),
  };
}

export function toUpdatePayload(values: UserFormValues): Omit<UserWriteInput, "userId"> {
  const cardno = values.cardno?.trim();
  return {
    name: values.name.trim(),
    password: values.password?.trim() || undefined,
    cardno: cardno ? Number(cardno) : undefined,
    role: Number(values.role),
  };
}

export async function listDeviceUsers(): Promise<DeviceUser[]> {
  const users = await apiListUsers();
  return users.sort((a, b) => a.userId.localeCompare(b.userId));
}

export async function createDeviceUser(input: UserWriteInput): Promise<DeviceUser> {
  return apiCreateUser(input);
}

export async function updateDeviceUser(
  userId: string,
  input: Omit<UserWriteInput, "userId">,
): Promise<DeviceUser> {
  return apiUpdateUser(userId, input);
}

export async function deleteDeviceUser(userId: string): Promise<void> {
  return apiDeleteUser(userId);
}

export async function deleteDeviceUsers(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await apiDeleteUser(userId);
  }
}

export async function importDeviceUsers(
  csv: string,
  updateExisting = false,
): Promise<ImportUsersResult> {
  return apiImportUsers(csv, updateExisting);
}

export function exportDeviceUsersCsv(users: DeviceUser[]): void {
  const csv = usersToCsv(users);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zkt-users-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getSortValue(user: DeviceUser, key: string): string | number {
  switch (key) {
    case "userId":
      return user.userId;
    case "name":
      return user.name;
    case "uid":
      return user.uid;
    case "role":
      return user.role;
    case "cardno":
      return user.cardno ?? -1;
    case "fingerprintCount":
      return user.fingerprintCount ?? -1;
    default:
      return user.userId;
  }
}

export function paginateDeviceUsers(users: DeviceUser[], sp: UsersSearchParams) {
  let rows = [...users];
  const query = sp.search?.trim().toLowerCase();

  if (query) {
    rows = rows.filter(
      (user) =>
        user.userId.toLowerCase().includes(query) ||
        user.name.toLowerCase().includes(query) ||
        String(user.uid).includes(query),
    );
  }

  if (sp.sort) {
    const [key, direction] = sp.sort.split(":");
    if (key && direction) {
      const desc = direction.toLowerCase() === "desc";
      rows.sort((a, b) => {
        const av = getSortValue(a, key);
        const bv = getSortValue(b, key);
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
    }
  }

  const page = sp.page ?? 1;
  const pageSize = sp.pageSize ?? 10;
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    nodes: rows.slice(start, start + pageSize),
    meta: {
      totalCount,
      totalPages,
      currentPage: safePage,
    },
  };
}

export function getMutationErrorMessage(error: unknown, fallback = "Request failed"): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  return fallback;
}

export type { PunchRecord };

export interface PunchListParams {
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export async function fetchUserPunchHistory(
  userId: string,
  options?: { from?: string; to?: string },
): Promise<PunchRecord[]> {
  return apiGetUserPunchHistory(userId, options);
}

export async function deleteUserPunch(record: PunchRecord): Promise<void> {
  return apiDeleteUserPunch({
    userId: String(record.deviceUserId),
    recordTime: record.recordTime,
    userSn: record.userSn,
  });
}

export function punchRecordKey(record: PunchRecord): string {
  return `${record.recordTime}|${record.userSn ?? ""}|${record.deviceUserId}`;
}

function getPunchSortValue(record: PunchRecord, key: string): string | number {
  switch (key) {
    case "recordTime":
      return record.recordTime;
    case "punchLabel":
      return record.punchLabel ?? "";
    case "statusLabel":
      return record.statusLabel ?? "";
    case "userSn":
      return record.userSn ?? -1;
    default:
      return record.recordTime;
  }
}

export function paginatePunchRecords(records: PunchRecord[], params: PunchListParams) {
  let rows = [...records];
  const query = params.search?.trim().toLowerCase();

  if (query) {
    rows = rows.filter(
      (record) =>
        record.punchLabel?.toLowerCase().includes(query) ||
        record.statusLabel?.toLowerCase().includes(query) ||
        record.recordTime.toLowerCase().includes(query) ||
        String(record.userSn ?? "").includes(query),
    );
  }

  if (params.sort) {
    const [key, direction] = params.sort.split(":");
    if (key && direction) {
      const desc = direction.toLowerCase() === "desc";
      rows.sort((a, b) => {
        const av = getPunchSortValue(a, key);
        const bv = getPunchSortValue(b, key);
        if (av < bv) return desc ? 1 : -1;
        if (av > bv) return desc ? -1 : 1;
        return 0;
      });
    }
  }

  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    nodes: rows.slice(start, start + pageSize),
    meta: {
      totalCount,
      totalPages,
      currentPage: safePage,
    },
  };
}
