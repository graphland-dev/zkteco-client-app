import { COMMANDS, USHRT_MAX } from "./constants.ts";
import type { AttendanceRecord, RealTimeLog, User } from "./types.ts";
import { getPunchLabel, getVerifyModeLabel } from "./attendance.ts";

const TCP_PREFIX = Buffer.from([
  0x50, 0x50, 0x82, 0x7d, 0x13, 0x00, 0x00, 0x00,
]);

export function createChecksum(buf: Buffer): number {
  let chksum = 0;
  for (let i = 0; i < buf.length; i += 2) {
    if (i === buf.length - 1) {
      chksum += buf[i]!;
    } else {
      chksum += buf.readUInt16LE(i);
    }
    chksum %= USHRT_MAX;
  }
  return USHRT_MAX - chksum - 1;
}

function buildHeader(
  command: number,
  sessionId: number,
  replyId: number,
  data: Buffer,
): Buffer {
  const buf = Buffer.alloc(8 + data.length);
  buf.writeUInt16LE(command, 0);
  buf.writeUInt16LE(0, 2);
  buf.writeUInt16LE(sessionId, 4);
  buf.writeUInt16LE(replyId, 6);
  data.copy(buf, 8);
  buf.writeUInt16LE(createChecksum(buf), 2);
  const nextReplyId = (replyId + 1) % USHRT_MAX;
  buf.writeUInt16LE(nextReplyId, 6);
  return buf;
}

export function createUDPHeader(
  command: number,
  sessionId: number,
  replyId: number,
  data: Buffer | string = "",
): Buffer {
  return buildHeader(command, sessionId, replyId, Buffer.from(data));
}

export function createTCPHeader(
  command: number,
  sessionId: number,
  replyId: number,
  data: Buffer | string = "",
): Buffer {
  const buf = buildHeader(command, sessionId, replyId, Buffer.from(data));
  const prefix = Buffer.from(TCP_PREFIX);
  prefix.writeUInt16LE(buf.length, 4);
  return Buffer.concat([prefix, buf]);
}

export function removeTcpHeader(buf: Buffer): Buffer {
  if (buf.length < 8) return buf;
  if (buf.compare(TCP_PREFIX.subarray(0, 4), 0, 4, 0, 4) !== 0) return buf;
  return buf.subarray(8);
}

export function decodeUDPHeader(header: Buffer) {
  return {
    commandId: header.readUIntLE(0, 2),
    checkSum: header.readUIntLE(2, 2),
    sessionId: header.readUIntLE(4, 2),
    replyId: header.readUIntLE(6, 2),
  };
}

export function decodeTCPHeader(header: Buffer) {
  const recvData = header.subarray(8);
  return {
    commandId: recvData.readUIntLE(0, 2),
    checkSum: recvData.readUIntLE(2, 2),
    sessionId: recvData.readUIntLE(4, 2),
    replyId: recvData.readUIntLE(6, 2),
    payloadSize: header.readUIntLE(4, 2),
  };
}

export function exportErrorMessage(commandValue: number): string {
  for (const [key, value] of Object.entries(COMMANDS)) {
    if (value === commandValue) return key;
  }
  return "AN UNKNOWN ERROR";
}

export function assertAckReply(payload: Buffer, context: string): void {
  if (payload.length < 2) {
    throw new Error(
      `Invalid device response for ${context}: empty payload (wrong port or not a ZKTeco device?)`,
    );
  }

  const commandId = payload.readUIntLE(0, 2);
  if (commandId === COMMANDS.CMD_ACK_OK) return;

  const errorCodes = new Set<number>([
    COMMANDS.CMD_ACK_ERROR,
    COMMANDS.CMD_ACK_ERROR_CMD,
    COMMANDS.CMD_ACK_ERROR_INIT,
    COMMANDS.CMD_ACK_ERROR_DATA,
    COMMANDS.CMD_ACK_UNAUTH,
  ]);

  if (errorCodes.has(commandId)) {
    throw new Error(
      `Device rejected ${context}: ${exportErrorMessage(commandId)} (check port and device settings)`,
    );
  }

  throw new Error(
    `Invalid device response for ${context}: expected CMD_ACK_OK, got ${exportErrorMessage(commandId)} (wrong port or not a ZKTeco device?)`,
  );
}

export function checkNotEventTCP(data: Buffer): boolean {
  try {
    const payload = removeTcpHeader(data);
    const commandId = payload.readUIntLE(0, 2);
    const event = payload.readUIntLE(4, 2);
    return event === COMMANDS.EF_ATTLOG && commandId === COMMANDS.CMD_REG_EVENT;
  } catch {
    return false;
  }
}

export function checkNotEventUDP(data: Buffer): boolean {
  return (
    decodeUDPHeader(data.subarray(0, 8)).commandId === COMMANDS.CMD_REG_EVENT
  );
}

function parseTimeToDate(time: number): Date {
  const second = time % 60;
  time = (time - second) / 60;
  const minute = time % 60;
  time = (time - minute) / 60;
  const hour = time % 24;
  time = (time - hour) / 24;
  const day = (time % 31) + 1;
  time = (time - (day - 1)) / 31;
  const month = time % 12;
  time = (time - month) / 12;
  const year = time + 2000;
  return new Date(year, month, day, hour, minute, second);
}

function parseHexToTime(hex: Buffer): Date {
  return new Date(
    2000 + hex.readUIntLE(0, 1),
    hex.readUIntLE(1, 1) - 1,
    hex.readUIntLE(2, 1),
    hex.readUIntLE(3, 1),
    hex.readUIntLE(4, 1),
    hex.readUIntLE(5, 1),
  );
}

export function decodeDeviceTime(encoded: number): Date {
  let t = encoded;
  const second = t % 60;
  t = Math.floor(t / 60);
  const minute = t % 60;
  t = Math.floor(t / 60);
  const hour = t % 24;
  t = Math.floor(t / 24);
  const day = (t % 31) + 1;
  t = Math.floor(t / 31);
  const month = (t % 12) + 1;
  t = Math.floor(t / 12);
  const year = t + 2000;
  return new Date(year, month - 1, day, hour, minute, second);
}

export function encodeDeviceTime(date: Date): number {
  return (
    ((date.getFullYear() % 100) * 12 * 31 +
      date.getMonth() * 31 +
      date.getDate() -
      1) *
      (24 * 60 * 60) +
    (date.getHours() * 60 + date.getMinutes()) * 60 +
    date.getSeconds()
  );
}

function readAsciiField(buf: Buffer, offset: number, length: number): string {
  return (
    buf
      .subarray(offset, offset + length)
      .toString("ascii")
      .split("\0")[0] ?? ""
  );
}

export function decodeUserData72(userData: Buffer): User {
  return {
    uid: userData.readUIntLE(0, 2),
    role: userData.readUIntLE(2, 1),
    password: readAsciiField(userData, 3, 8),
    name: readAsciiField(userData, 11, 24),
    cardno: userData.readUIntLE(35, 4),
    userId: readAsciiField(userData, 48, 9),
  };
}

export function decodeUserData28(userData: Buffer): User {
  return {
    uid: userData.readUIntLE(0, 2),
    role: userData.readUIntLE(2, 1),
    name: readAsciiField(userData, 8, 8),
    userId: String(userData.readUIntLE(24, 4)),
  };
}

export function decodeRecordData40(
  recordData: Buffer,
  ip?: string,
): AttendanceRecord {
  const status = recordData.readUIntLE(26, 1);
  const punch = recordData.readUIntLE(31, 1);
  return {
    userSn: recordData.readUIntLE(0, 2),
    deviceUserId: readAsciiField(recordData, 2, 24),
    recordTime: parseTimeToDate(recordData.readUInt32LE(27)),
    status,
    statusLabel: getVerifyModeLabel(status),
    punch,
    punchLabel: getPunchLabel(punch),
    ip,
  };
}

export function decodeRecordData16(
  recordData: Buffer,
  ip?: string,
): AttendanceRecord {
  const status = recordData.readUIntLE(8, 1);
  const punch = recordData.readUIntLE(9, 1);
  return {
    deviceUserId: recordData.readUIntLE(0, 4),
    recordTime: parseTimeToDate(recordData.readUInt32LE(4)),
    status,
    statusLabel: getVerifyModeLabel(status),
    punch,
    punchLabel: getPunchLabel(punch),
    ip,
  };
}

export function decodeRecordRealTimeLog18(recordData: Buffer): RealTimeLog {
  return {
    userId: recordData.readUIntLE(8, 1),
    attTime: parseHexToTime(recordData.subarray(12, 18)),
  };
}

export function decodeRecordRealTimeLog52(recordData: Buffer): RealTimeLog {
  const payload = removeTcpHeader(recordData);
  const recvData = payload.subarray(8);
  return {
    userId: readAsciiField(recvData, 0, 9),
    attTime: parseHexToTime(recvData.subarray(26, 32)),
  };
}

export function parseUsersFromBuffer(
  data: Buffer,
  packetSize: number,
  ip?: string,
): User[] {
  const users: User[] = [];
  let userData = data.subarray(4);
  while (userData.length >= packetSize) {
    const user =
      packetSize === 72
        ? decodeUserData72(userData.subarray(0, packetSize))
        : decodeUserData28(userData.subarray(0, packetSize));
    users.push(user);
    userData = userData.subarray(packetSize);
  }
  return users;
}

export function parseAttendancesFromBuffer(
  data: Buffer,
  packetSize: number,
  ip?: string,
): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  let recordData = data.subarray(4);
  while (recordData.length >= packetSize) {
    const record =
      packetSize === 40
        ? decodeRecordData40(recordData.subarray(0, packetSize), ip)
        : decodeRecordData16(recordData.subarray(0, packetSize), ip);
    records.push(record);
    recordData = recordData.subarray(packetSize);
  }
  return records;
}
