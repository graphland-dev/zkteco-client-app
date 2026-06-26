import { ERROR_TYPES, ZkError, ZkConnectionError, ZkNotFoundError } from "./errors.ts";
import {
  RECORD_PACKET_SIZE_TCP,
  RECORD_PACKET_SIZE_UDP,
} from "./constants.ts";
import { parseAttendancesFromBuffer, parseUsersFromBuffer, encodeAttendancesBuffer, parseFingerprintTemplatesFromBuffer } from "./protocol.ts";
import { TcpTransport } from "./transport/tcp.ts";
import { UdpTransport } from "./transport/udp.ts";
import { encodeUser } from "./user-encoding.ts";
import { matchesUser, normalizeSearchCriteria } from "./user-search.ts";
import { filterAttendances } from "./attendance-search.ts";
import type {
  AttendanceRecord,
  ConnectCallbacks,
  CreateUserInput,
  DeleteAttendanceCriteria,
  DeviceInfo,
  FingerprintTemplateIndex,
  GetUserAttendancesOptions,
  RealTimeLog,
  Transport,
  UpdateUserInput,
  User,
  UserSearchCriteria,
  ZkClientOptions,
} from "./types.ts";

export class ZkClient {
  readonly ip: string;
  readonly port: number;
  readonly timeout: number;
  readonly udpPort: number;
  readonly openDoorDelaySec: number;
  readonly commKey: number;

  connectionType: "tcp" | "udp" | null = null;
  private transport: Transport | null = null;
  private readonly tcp: TcpTransport;
  private readonly udp: UdpTransport;

  constructor(options: ZkClientOptions);
  constructor(ip: string, port?: number, timeout?: number, udpPort?: number);
  constructor(
    ipOrOptions: string | ZkClientOptions,
    port = 4370,
    timeout = 10000,
    udpPort = 4000,
  ) {
    if (typeof ipOrOptions === "string") {
      this.ip = ipOrOptions;
      this.port = port;
      this.timeout = timeout;
      this.udpPort = udpPort;
      this.openDoorDelaySec = 3;
      this.commKey = 0;
    } else {
      this.ip = ipOrOptions.ip;
      this.port = ipOrOptions.port ?? 4370;
      this.timeout = ipOrOptions.timeout ?? 10000;
      this.udpPort = ipOrOptions.udpPort ?? 4000;
      this.openDoorDelaySec = ipOrOptions.openDoorDelaySec ?? 3;
      this.commKey = ipOrOptions.commKey ?? 0;
    }

    this.tcp = new TcpTransport(this.ip, this.port, this.timeout, this.commKey);
    this.udp = new UdpTransport(this.ip, this.port, this.timeout, this.udpPort, this.commKey);
  }

  get isConnected(): boolean {
    return this.transport !== null;
  }

  private get recordPacketSize(): number {
    return this.connectionType === "tcp" ? RECORD_PACKET_SIZE_TCP : RECORD_PACKET_SIZE_UDP;
  }

  private async run<T>(command: string, fn: () => Promise<T>): Promise<T> {
    if (!this.transport) {
      throw new ZkError(new Error("Socket isn't connected"), command, this.ip);
    }
    try {
      return await fn();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new ZkError(error, `[${this.connectionType?.toUpperCase() ?? "?"}] ${command}`, this.ip);
    }
  }

  async connect(callbacks: ConnectCallbacks = {}): Promise<void> {
    const { onError, onClose } = callbacks;

    try {
      await this.tcp.connect(
        onError,
        onClose ? () => onClose("tcp") : undefined,
      );
      this.connectionType = "tcp";
      this.transport = this.tcp;
      await this.verifyDevice();
      return;
    } catch (err) {
      const tcpErr = err as NodeJS.ErrnoException;
      this.connectionType = null;
      this.transport = null;
      try {
        await this.tcp.disconnect();
      } catch {
        // ignore
      }

      if (tcpErr.code !== ERROR_TYPES.ECONNREFUSED) {
        throw err instanceof ZkError
          ? err
          : new ZkConnectionError(
              tcpErr instanceof Error ? tcpErr : new Error(String(tcpErr)),
              this.ip,
              this.port,
            );
      }
    }

    try {
      await this.udp.connect(
        onError,
        onClose ? () => onClose("udp") : undefined,
      );
      this.connectionType = "udp";
      this.transport = this.udp;
      await this.verifyDevice();
    } catch (err) {
      const udpErr = err as NodeJS.ErrnoException;
      this.connectionType = null;
      this.transport = null;
      try {
        await this.udp.disconnect();
      } catch {
        // ignore
      }

      if (udpErr.code === ERROR_TYPES.EADDRINUSE) {
        throw new ZkConnectionError(
          new Error(
            `UDP port ${this.udpPort} is already in use and TCP connection to port ${this.port} was refused`,
          ),
          this.ip,
          this.port,
        );
      }

      throw err instanceof ZkError
        ? err
        : new ZkConnectionError(
            udpErr instanceof Error ? udpErr : new Error(String(udpErr)),
            this.ip,
            this.port,
          );
    }
  }

  private async verifyDevice(): Promise<void> {
    try {
      await this.transport!.getInfo();
    } catch (err) {
      const failedTransport = this.transport;
      this.transport = null;
      this.connectionType = null;
      try {
        await failedTransport?.disconnect();
      } catch {
        // ignore
      }
      throw new ZkConnectionError(
        err instanceof Error ? err : new Error(String(err)),
        this.ip,
        this.port,
      );
    }
  }

  /** @deprecated Use connect() */
  createSocket = this.connect;

  async disconnect(): Promise<void> {
    return this.run("disconnect", async () => {
      await this.transport!.disconnect();
      this.transport = null;
      this.connectionType = null;
    });
  }

  async getInfo(): Promise<DeviceInfo> {
    return this.run("getInfo", () => this.transport!.getInfo());
  }

  async getUsers(): Promise<User[]> {
    return this.run("getUsers", async () => {
      const { data, err } = await this.transport!.getUsers();
      const users = parseUsersFromBuffer(data, this.transport!.userPacketSize, this.ip);
      if (err) throw err;
      return users;
    });
  }

  async getFingerprintTemplates(): Promise<FingerprintTemplateIndex[]> {
    return this.run("getFingerprintTemplates", async () => {
      const { data, err } = await this.transport!.getFingerprintTemplates();
      const templates = parseFingerprintTemplatesFromBuffer(data);
      if (err) throw err;
      return templates;
    });
  }

  async getUserById(userId: string): Promise<User> {
    const user = await this.searchUser({ userId, match: "exact" });
    if (!user) throw new ZkNotFoundError("User", userId);
    return user;
  }

  async getUserByUid(uid: number): Promise<User> {
    const user = await this.searchUser({ uid });
    if (!user) throw new ZkNotFoundError("User", uid);
    return user;
  }

  /**
   * Search users by free-text query or specific fields (name, userId, uid, cardno, role).
   * Pass a string to search across name, userId, uid, and card number.
   */
  async searchUsers(criteria: string | UserSearchCriteria): Promise<User[]> {
    return this.run("searchUsers", async () => {
      const normalized = normalizeSearchCriteria(criteria);
      const users = await this.getUsers();
      return users.filter((user) => matchesUser(user, normalized));
    });
  }

  /** Returns the first user matching the search criteria, or null. */
  async searchUser(criteria: string | UserSearchCriteria): Promise<User | null> {
    const users = await this.searchUsers(criteria);
    return users[0] ?? null;
  }

  private async nextUid(): Promise<number> {
    const users = await this.getUsers();
    if (users.length === 0) return 1;
    return Math.max(...users.map((u) => u.uid)) + 1;
  }

  private async writeUserWithRefresh(payload: Buffer): Promise<void> {
    await this.transport!.disableDevice();
    try {
      await this.transport!.setUser(payload);
      await this.transport!.refreshData();
    } finally {
      await this.transport!.enableDevice();
    }
  }

  async createUser(input: CreateUserInput): Promise<User> {
    return this.run("createUser", async () => {
      const existing = await this.searchUser({ userId: input.userId, match: "exact" });
      if (existing) {
        throw new Error(`User already exists with id ${input.userId}`);
      }

      const uid = input.uid ?? (await this.nextUid());
      const payload = encodeUser(
        {
          uid,
          userId: input.userId,
          name: input.name,
          password: input.password,
          role: input.role,
          cardno: input.cardno,
          group: input.group,
          enabled: input.enabled,
        },
        this.transport!.userPacketSize,
      );

      await this.writeUserWithRefresh(payload);

      return {
        uid,
        role: typeof input.role === "number" ? input.role : 0,
        name: input.name,
        password: input.password,
        cardno: input.cardno,
        userId: input.userId,
      };
    });
  }

  async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    return this.run("updateUser", async () => {
      const existing = await this.getUserById(userId);
      if (!existing) throw new ZkNotFoundError("User", userId);

      const payload = encodeUser(
        {
          uid: existing.uid,
          userId: existing.userId,
          name: input.name ?? existing.name,
          password: input.password ?? existing.password,
          role: input.role ?? existing.role,
          cardno: input.cardno ?? existing.cardno,
          group: input.group,
          enabled: input.enabled,
        },
        this.transport!.userPacketSize,
      );

      await this.writeUserWithRefresh(payload);

      return {
        ...existing,
        name: input.name ?? existing.name,
        password: input.password ?? existing.password,
        role: typeof input.role === "number" ? input.role : existing.role,
        cardno: input.cardno ?? existing.cardno,
      };
    });
  }

  async deleteUser(ref: number | string): Promise<void> {
    return this.run("deleteUser", async () => {
      let uid: number;
      if (typeof ref === "number") {
        uid = ref;
      } else {
        const user = await this.getUserById(ref);
        if (!user) throw new ZkNotFoundError("User", ref);
        uid = user.uid;
      }

      await this.transport!.disableDevice();
      try {
        await this.transport!.deleteUser(uid);
        await this.transport!.refreshData();
      } finally {
        await this.transport!.enableDevice();
      }
    });
  }

  async getAttendances(
    onProgress?: (received: number, total: number) => void,
  ): Promise<AttendanceRecord[]> {
    return this.run("getAttendances", async () => {
      const { data, err } = await this.transport!.getAttendances(onProgress);
      const records = parseAttendancesFromBuffer(data, this.recordPacketSize, this.ip);
      if (err) throw err;
      return records;
    });
  }

  /**
   * Get attendance records for a specific user.
   * The device returns all logs — this method filters by userId client-side.
   */
  async getUserAttendances(
    userId: string,
    options: GetUserAttendancesOptions = {},
  ): Promise<AttendanceRecord[]> {
    return this.run("getUserAttendances", async () => {
      const records = await this.getAttendances(options.onProgress);
      return filterAttendances(records, {
        userId,
        from: options.from,
        to: options.to,
      });
    });
  }

  /**
   * Get attendance records for a user by device uid.
   */
  async getUserAttendancesByUid(
    uid: number,
    options: GetUserAttendancesOptions = {},
  ): Promise<AttendanceRecord[]> {
    return this.run("getUserAttendancesByUid", async () => {
      const records = await this.getAttendances(options.onProgress);
      return filterAttendances(records, {
        uid,
        from: options.from,
        to: options.to,
      });
    });
  }

  async clearAttendanceLog(): Promise<void> {
    return this.run("clearAttendanceLog", async () => {
      await this.transport!.clearAttendanceLog();
    });
  }

  async replaceAttendanceLog(records: AttendanceRecord[]): Promise<void> {
    return this.run("replaceAttendanceLog", async () => {
      const transport = this.transport!;
      const buffer = encodeAttendancesBuffer(records, this.recordPacketSize);
      await transport.disableDevice();
      try {
        await transport.clearAttendanceLog();
        if (records.length > 0) {
          await transport.sendWithBuffer(buffer);
        }
        await transport.refreshData();
      } finally {
        await transport.enableDevice();
      }
    });
  }

  async deleteAttendanceRecord(criteria: DeleteAttendanceCriteria): Promise<void> {
    return this.run("deleteAttendanceRecord", async () => {
      const records = await this.getAttendances();
      const targetTime = criteria.recordTime.getTime();
      const remaining = records.filter((record) => {
        const sameUser = String(record.deviceUserId) === String(criteria.userId);
        const sameTime = record.recordTime.getTime() === targetTime;
        const sameSn =
          criteria.userSn === undefined || record.userSn === criteria.userSn;
        return !(sameUser && sameTime && sameSn);
      });

      if (remaining.length === records.length) {
        throw new ZkNotFoundError("AttendanceRecord", criteria.userId);
      }

      await this.replaceAttendanceLog(remaining);
    });
  }

  async disableDevice(): Promise<void> {
    return this.run("disableDevice", () => this.transport!.disableDevice().then(() => undefined));
  }

  async enableDevice(): Promise<void> {
    return this.run("enableDevice", () => this.transport!.enableDevice().then(() => undefined));
  }

  async refreshData(): Promise<void> {
    return this.run("refreshData", () => this.transport!.refreshData().then(() => undefined));
  }

  async openDoor(delaySec = this.openDoorDelaySec): Promise<void> {
    return this.run("openDoor", () => this.transport!.openDoor(delaySec).then(() => undefined));
  }

  async getTime(): Promise<Date> {
    return this.run("getTime", () => this.transport!.getTime());
  }

  async setTime(date: Date = new Date()): Promise<void> {
    return this.run("setTime", () => this.transport!.setTime(date).then(() => undefined));
  }

  async getRealTimeLogs(callback: (log: RealTimeLog) => void): Promise<void> {
    return this.run("getRealTimeLogs", async () => {
      this.transport!.getRealTimeLogs(callback);
    });
  }

  async executeCmd(command: number, data: Buffer | string = ""): Promise<Buffer> {
    return this.run("executeCmd", () => this.transport!.executeCmd(command, data));
  }

  async freeData(): Promise<void> {
    return this.run("freeData", () => this.transport!.freeData().then(() => undefined));
  }
}

export default ZkClient;
