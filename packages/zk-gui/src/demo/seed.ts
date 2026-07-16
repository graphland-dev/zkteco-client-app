import { DEMO_MODE_ENABLED } from "./config";

export const DEMO_SEEDED_KEY = "gl-zkt-demo-seeded";
export const DEMO_USERS_KEY = "gl-zkt-demo-users";
export const ATTENDANCE_LOG_KEY = "gl-zkt-attendance-log";

export type DemoUser = {
  userId: string;
  name: string;
  uid: number;
  role: number;
  fingerprintCount: number;
  fingerprintIndices: number[];
  cardno?: number;
};

export type StoredAttendancePass = {
  id: string;
  userId: string;
  userName?: string;
  attTime: string;
  deviceIp: string;
  delivered?: boolean;
  source: "live" | "sync" | "demo" | "seed";
};

export const DEMO_MACHINES = [
  { ip: "192.168.0.153", label: "Main gate" },
  { ip: "192.168.0.210", label: "Office floor" },
] as const;

export const DEMO_USERS: DemoUser[] = [
  {
    userId: "1001",
    name: "Ayesha Rahman",
    uid: 1,
    role: 0,
    fingerprintCount: 2,
    fingerprintIndices: [0, 1],
    cardno: 10001,
  },
  {
    userId: "1002",
    name: "Sabbir Latif",
    uid: 2,
    role: 0,
    fingerprintCount: 1,
    fingerprintIndices: [0],
  },
  {
    userId: "1003",
    name: "Nusrat Jahan",
    uid: 3,
    role: 14,
    fingerprintCount: 0,
    fingerprintIndices: [],
    cardno: 10003,
  },
  {
    userId: "1004",
    name: "Rafiul Islam",
    uid: 4,
    role: 0,
    fingerprintCount: 3,
    fingerprintIndices: [0, 1, 6],
  },
  {
    userId: "1005",
    name: "Mehedi Hasan",
    uid: 5,
    role: 0,
    fingerprintCount: 1,
    fingerprintIndices: [1],
  },
];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makePassId(attTime: string): string {
  return `${attTime}-${Math.random().toString(16).slice(2, 10)}`;
}

function buildSeedAttendance(): StoredAttendancePass[] {
  const passes: StoredAttendancePass[] = [];
  const now = Date.now();

  for (let i = 0; i < 12; i++) {
    const user = DEMO_USERS[randomInt(0, DEMO_USERS.length - 1)]!;
    const machine = DEMO_MACHINES[randomInt(0, DEMO_MACHINES.length - 1)]!;
    const attTime = new Date(now - randomInt(1, 1000 * 60 * 60 * 48)).toISOString();
    passes.push({
      id: makePassId(attTime),
      userId: user.userId,
      userName: user.name,
      attTime,
      deviceIp: machine.ip,
      delivered: true,
      source: "seed",
    });
  }

  return passes.sort((a, b) => b.attTime.localeCompare(a.attTime));
}

export function loadAttendanceLog(): StoredAttendancePass[] {
  try {
    const raw = localStorage.getItem(ATTENDANCE_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredAttendancePass[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAttendanceLog(passes: StoredAttendancePass[]): void {
  localStorage.setItem(ATTENDANCE_LOG_KEY, JSON.stringify(passes.slice(0, 200)));
}

export function mergeAttendancePasses(
  existing: StoredAttendancePass[],
  incoming: StoredAttendancePass[],
): StoredAttendancePass[] {
  const map = new Map<string, StoredAttendancePass>();
  for (const pass of [...incoming, ...existing]) {
    const key = `${pass.deviceIp}|${pass.userId}|${pass.attTime}`;
    if (!map.has(key)) map.set(key, pass);
  }
  return Array.from(map.values())
    .sort((a, b) => b.attTime.localeCompare(a.attTime))
    .slice(0, 200);
}

export function loadDemoUsers(): DemoUser[] {
  try {
    const raw = localStorage.getItem(DEMO_USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoUser[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDemoUsers(users: DemoUser[]): void {
  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(users));
}

export function listDemoUsersAsDeviceUsers(): DemoUser[] {
  return loadDemoUsers().slice().sort((a, b) => a.userId.localeCompare(b.userId));
}

export function createDemoUser(input: {
  userId: string;
  name: string;
  password?: string;
  cardno?: number;
  role?: number;
}): DemoUser {
  const users = loadDemoUsers();
  if (users.some((user) => user.userId === input.userId)) {
    throw new Error(`User ${input.userId} already exists`);
  }
  const nextUid = users.reduce((max, user) => Math.max(max, user.uid), 0) + 1;
  const created: DemoUser = {
    userId: input.userId,
    name: input.name,
    uid: nextUid,
    role: input.role ?? 0,
    cardno: input.cardno,
    fingerprintCount: 0,
    fingerprintIndices: [],
  };
  saveDemoUsers([...users, created]);
  return created;
}

export function updateDemoUser(
  userId: string,
  input: {
    userId?: string;
    name: string;
    password?: string;
    cardno?: number;
    role?: number;
  },
): DemoUser {
  const users = loadDemoUsers();
  const index = users.findIndex((user) => user.userId === userId);
  if (index < 0) throw new Error(`User ${userId} not found`);
  const nextUserId = input.userId?.trim() || userId;
  if (nextUserId !== userId && users.some((user) => user.userId === nextUserId)) {
    throw new Error(`User ${nextUserId} already exists`);
  }
  const current = users[index]!;
  const updated: DemoUser = {
    ...current,
    userId: nextUserId,
    name: input.name,
    role: input.role ?? current.role,
    cardno: input.cardno,
  };
  const next = [...users];
  next[index] = updated;
  saveDemoUsers(next);
  return updated;
}

export function deleteDemoUser(userId: string): void {
  const users = loadDemoUsers();
  const next = users.filter((user) => user.userId !== userId);
  if (next.length === users.length) throw new Error(`User ${userId} not found`);
  saveDemoUsers(next);
}

export function deleteDemoUsers(userIds: string[]): void {
  const remove = new Set(userIds);
  saveDemoUsers(loadDemoUsers().filter((user) => !remove.has(user.userId)));
}

/** Writes seed users + previous multi-machine attendance into localStorage once. */
export function ensureDemoSeed(): boolean {
  if (!DEMO_MODE_ENABLED) return false;
  if (localStorage.getItem(DEMO_SEEDED_KEY) === "1") return false;

  localStorage.setItem(DEMO_USERS_KEY, JSON.stringify(DEMO_USERS));
  const existing = loadAttendanceLog();
  saveAttendanceLog(mergeAttendancePasses(existing, buildSeedAttendance()));
  localStorage.setItem(DEMO_SEEDED_KEY, "1");
  return true;
}

/** Appends one simulated punch (optionally across demo machines). */
export function simulateAttendancePunch(): StoredAttendancePass {
  const users = loadDemoUsers().length > 0 ? loadDemoUsers() : DEMO_USERS;
  const user = users[randomInt(0, users.length - 1)]!;
  const machine = DEMO_MACHINES[randomInt(0, DEMO_MACHINES.length - 1)]!;
  const attTime = new Date().toISOString();
  const pass: StoredAttendancePass = {
    id: makePassId(attTime),
    userId: user.userId,
    userName: user.name,
    attTime,
    deviceIp: machine.ip,
    delivered: true,
    source: "demo",
  };
  saveAttendanceLog(mergeAttendancePasses(loadAttendanceLog(), [pass]));
  return pass;
}

export function clearDemoData(): void {
  localStorage.removeItem(DEMO_SEEDED_KEY);
  localStorage.removeItem(DEMO_USERS_KEY);
  localStorage.removeItem(ATTENDANCE_LOG_KEY);
  localStorage.removeItem("gl-zkt-portal-users");
}

export function listDemoUserPunches(userId: string): {
  deviceUserId: string;
  recordTime: string;
  punchLabel: string;
  statusLabel?: string;
}[] {
  return loadAttendanceLog()
    .filter((pass) => pass.userId === userId)
    .map((pass) => ({
      deviceUserId: pass.userId,
      recordTime: pass.attTime,
      punchLabel: "punched",
      statusLabel: pass.deviceIp,
    }));
}

export function deleteDemoUserPunch(userId: string, recordTime: string): void {
  saveAttendanceLog(
    loadAttendanceLog().filter(
      (pass) => !(pass.userId === userId && pass.attTime === recordTime),
    ),
  );
  window.dispatchEvent(new Event("gl-zkt-attendance-updated"));
}
