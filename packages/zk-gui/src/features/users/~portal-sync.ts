import type { DeviceUser } from "@/types";

export const PORTAL_USERS_KEY = "gl-zkt-portal-users";

export type PortalUser = {
  userId: string;
  name: string;
};

export type UserSyncStatus = "new" | "skip" | "conflict";

export type ConflictKind = "name_mismatch" | "id_mismatch";

export type UserSyncPreview = {
  user: DeviceUser;
  status: UserSyncStatus;
  portalUser?: PortalUser;
  conflictKind?: ConflictKind;
};

export type ConflictKeepSide = "device" | "portal";

export type UserSyncOutcome = {
  userId: string;
  name: string;
  status: "new" | "skip" | "resolved";
  message: string;
  kept?: ConflictKeepSide;
};

/** Seed portal users used for conflict detection before the first real sync. */
const SEED_PORTAL_USERS: PortalUser[] = [
  { userId: "1001", name: "Ayesha Rahman" }, // same id + name → skip
  { userId: "1002", name: "Sabbir Ahmed" }, // same id, different name → conflict
  { userId: "1003", name: "Nusrat Jahan" }, // same id + name → skip
  { userId: "9001", name: "Mehedi Hasan" }, // same name as device 1005, different id → conflict
];

export function loadPortalUsers(): PortalUser[] {
  try {
    const raw = localStorage.getItem(PORTAL_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PortalUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePortalUsers(users: PortalUser[]): void {
  localStorage.setItem(PORTAL_USERS_KEY, JSON.stringify(users));
}

export function ensurePortalUsersSeed(): void {
  if (localStorage.getItem(PORTAL_USERS_KEY)) return;
  savePortalUsers(SEED_PORTAL_USERS);
}

function namesEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function classifyUser(
  device: DeviceUser,
  portalById: Map<string, PortalUser>,
  portalByName: Map<string, PortalUser>,
): UserSyncPreview {
  const byId = portalById.get(device.userId);
  if (byId) {
    if (namesEqual(byId.name, device.name)) {
      return { user: device, status: "skip", portalUser: byId };
    }
    return {
      user: device,
      status: "conflict",
      portalUser: byId,
      conflictKind: "name_mismatch",
    };
  }

  const byName = portalByName.get(device.name.trim().toLowerCase());
  if (byName && byName.userId !== device.userId) {
    return {
      user: device,
      status: "conflict",
      portalUser: byName,
      conflictKind: "id_mismatch",
    };
  }

  return { user: device, status: "new" };
}

function portalIndexes(portal: PortalUser[]) {
  const portalById = new Map(portal.map((user) => [user.userId, user]));
  const portalByName = new Map(
    portal.map((user) => [user.name.trim().toLowerCase(), user]),
  );
  return { portalById, portalByName };
}

/** Preview how each device user would sync against the portal. */
export function previewUsersForPortalSync(deviceUsers: DeviceUser[]): UserSyncPreview[] {
  ensurePortalUsersSeed();
  const { portalById, portalByName } = portalIndexes(loadPortalUsers());
  return deviceUsers.map((user) => classifyUser(user, portalById, portalByName));
}

/**
 * Sync a single device/demo user into the portal store.
 * - no match → create
 * - id + name match → skip
 * - conflict without keep → returns unresolved (caller must choose)
 * - conflict with keep → both sides end with the same id and name
 */
export function syncUserToPortal(
  device: DeviceUser,
  options?: { keep?: ConflictKeepSide },
): UserSyncOutcome & { applyToDevice?: PortalUser } {
  ensurePortalUsersSeed();
  const portal = loadPortalUsers();
  const { portalById, portalByName } = portalIndexes(portal);
  const preview = classifyUser(device, portalById, portalByName);

  if (preview.status === "new") {
    const next = { userId: device.userId, name: device.name };
    portalById.set(device.userId, next);
    savePortalUsers(Array.from(portalById.values()).sort((a, b) => a.userId.localeCompare(b.userId)));
    return {
      userId: device.userId,
      name: device.name,
      status: "new",
      message: "Created on portal.",
    };
  }

  if (preview.status === "skip") {
    return {
      userId: device.userId,
      name: device.name,
      status: "skip",
      message: "Skipped — id and name already match on portal.",
    };
  }

  const portalUser = preview.portalUser!;
  const keep = options?.keep;
  if (!keep) {
    return {
      userId: device.userId,
      name: device.name,
      status: "skip",
      message:
        preview.conflictKind === "id_mismatch"
          ? `Conflict — portal has the same name under id ${portalUser.userId}. Choose which to keep.`
          : `Conflict — portal has this id as “${portalUser.name}”. Choose which to keep.`,
    };
  }

  if (keep === "device") {
    // Portal adopts device id + name.
    if (preview.conflictKind === "id_mismatch") {
      portalById.delete(portalUser.userId);
    }
    portalById.set(device.userId, { userId: device.userId, name: device.name });
    savePortalUsers(Array.from(portalById.values()).sort((a, b) => a.userId.localeCompare(b.userId)));
    return {
      userId: device.userId,
      name: device.name,
      status: "resolved",
      kept: "device",
      message: `Kept device — portal now uses id ${device.userId} / ${device.name}.`,
    };
  }

  // Keep portal — portal unchanged; device should be updated to match.
  return {
    userId: portalUser.userId,
    name: portalUser.name,
    status: "resolved",
    kept: "portal",
    message: `Kept portal — device should use id ${portalUser.userId} / ${portalUser.name}.`,
    applyToDevice: portalUser,
  };
}
