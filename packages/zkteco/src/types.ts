export type ConnectionType = "tcp" | "udp";

export type UserRoleName = "user" | "enroller" | "admin" | "superadmin";
export type UserRole = number | UserRoleName;

export interface User {
  uid: number;
  role: number;
  name: string;
  password?: string;
  cardno?: number;
  userId: string;
}

export interface FingerprintTemplateIndex {
  uid: number;
  fingerIndex: number;
  valid: number;
}

export interface CreateUserInput {
  userId: string;
  name: string;
  password?: string;
  role?: UserRole;
  cardno?: number;
  uid?: number;
  group?: number;
  enabled?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  password?: string;
  role?: UserRole;
  cardno?: number;
  group?: number;
  enabled?: boolean;
}

export interface UserSearchCriteria {
  /** Free-text search across name, userId, uid, and card number */
  query?: string;
  /** Device-internal uid */
  uid?: number;
  /** Your assigned user id */
  userId?: string;
  /** Alias for userId */
  id?: string;
  name?: string;
  cardno?: number;
  role?: number;
  /** `partial` (default) uses contains; `exact` requires full match on string fields */
  match?: "exact" | "partial";
}

export interface DeviceInfo {
  userCounts: number;
  logCounts: number;
  logCapacity: number;
}

export interface AttendanceRecord {
  userSn?: number;
  deviceUserId: string | number;
  recordTime: Date;
  /** Check-in/out state from device function key (0=out, 1=in, 2=break-out, 3=break-in, …) */
  punch?: number;
  /** Human-readable punch label, e.g. "check-in" */
  punchLabel?: string;
  /** How user verified: fingerprint, card, password, face, etc. */
  status?: number;
  statusLabel?: string;
  ip?: string;
}

export interface AttendanceFilter {
  userId?: string;
  uid?: number;
  from?: Date;
  to?: Date;
}

export interface DeleteAttendanceCriteria {
  userId: string;
  recordTime: Date;
  userSn?: number;
}

export interface GetUserAttendancesOptions {
  from?: Date;
  to?: Date;
  onProgress?: (received: number, total: number) => void;
}

export interface RealTimeLog {
  userId: string | number;
  attTime: Date;
  status?: number;
  punch?: number;
}

export interface ZKTecoClientOptions {
  ip: string;
  port?: number;
  timeout?: number;
  udpPort?: number;
  openDoorDelaySec?: number;
  /** Device communication key (CommKey). Default 0 = no password. */
  commKey?: number;
}

export interface ConnectCallbacks {
  onError?: (error: Error) => void;
  onClose?: (type: ConnectionType) => void;
}

export interface EncodeUserOptions {
  uid: number;
  role?: UserRole;
  name?: string;
  password?: string;
  cardno?: number;
  cardNumber?: number;
  userId?: string;
  group?: number;
  groupNumber?: number;
  enabled?: boolean;
  permissionToken?: number;
  timezones?: number[];
  useGroupTimezones?: boolean;
}

export interface ReadBufferResult {
  data: Buffer;
  err?: Error | null;
}

export interface Transport {
  readonly ip: string;
  readonly userPacketSize: number;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  freeData(): Promise<Buffer>;
  disableDevice(): Promise<Buffer>;
  enableDevice(): Promise<Buffer>;
  refreshData(): Promise<Buffer>;
  getInfo(): Promise<DeviceInfo>;
  getUsers(): Promise<ReadBufferResult>;
  getFingerprintTemplates(): Promise<ReadBufferResult>;
  getAttendances(
    onProgress?: (received: number, total: number) => void,
  ): Promise<ReadBufferResult>;
  clearAttendanceLog(): Promise<Buffer>;
  clearDeviceData(): Promise<Buffer>;
  sendWithBuffer(buffer: Buffer): Promise<void>;
  setUser(payload: Buffer): Promise<Buffer>;
  deleteUser(uid: number): Promise<Buffer>;
  openDoor(delaySec: number): Promise<Buffer>;
  getTime(): Promise<Date>;
  setTime(date: Date): Promise<Buffer>;
  getRealTimeLogs(callback: (log: RealTimeLog) => void): void;
  executeCmd(command: number, data?: Buffer | string): Promise<Buffer>;
}
