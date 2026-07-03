import { describe, expect, test } from "bun:test";
import { COMMANDS } from "../src/constants.ts";
import {
  assertAckReply,
  createTCPHeader,
  createUDPHeader,
  decodeDeviceTime,
  decodeRecordData40,
  decodeRecordData16,
  decodeRecordRealTimeLog52,
  decodeUserData72,
  encodeAttendancesBuffer,
  encodeDeviceTime,
  encodeRecordData40,
  exportErrorMessage,
  parseAttendancesFromBuffer,
  parseFingerprintTemplatesFromBuffer,
  parseUsersFromBuffer,
  removeTcpHeader,
  summarizeFingerprintTemplates,
} from "../src/protocol.ts";

describe("headers", () => {
  test("createUDPHeader includes command and checksum", () => {
    const header = createUDPHeader(COMMANDS.CMD_CONNECT, 0, 0);
    expect(header.readUInt16LE(0)).toBe(COMMANDS.CMD_CONNECT);
    expect(header.readUInt16LE(2)).not.toBe(0);
  });

  test("createTCPHeader prepends magic prefix", () => {
    const header = createTCPHeader(COMMANDS.CMD_CONNECT, 0, 0);
    expect(header[0]).toBe(0x50);
    expect(header[1]).toBe(0x50);
    expect(removeTcpHeader(header).readUInt16LE(0)).toBe(COMMANDS.CMD_CONNECT);
  });
});

describe("assertAckReply", () => {
  test("accepts CMD_ACK_OK", () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt16LE(COMMANDS.CMD_ACK_OK, 0);
    expect(() => assertAckReply(buf, "test")).not.toThrow();
  });

  test("rejects CMD_ACK_UNAUTH", () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt16LE(COMMANDS.CMD_ACK_UNAUTH, 0);
    expect(() => assertAckReply(buf, "test")).toThrow(/CMD_ACK_UNAUTH/);
  });

  test("rejects empty payload", () => {
    expect(() => assertAckReply(Buffer.alloc(0), "test")).toThrow(/empty payload/);
  });
});

describe("device time", () => {
  test("round-trips encode and decode", () => {
    const date = new Date(2026, 5, 24, 13, 39, 43);
    const encoded = encodeDeviceTime(date);
    const decoded = decodeDeviceTime(encoded);
    expect(decoded.getFullYear()).toBe(2026);
    expect(decoded.getMonth()).toBe(5);
    expect(decoded.getDate()).toBe(24);
    expect(decoded.getHours()).toBe(13);
    expect(decoded.getMinutes()).toBe(39);
    expect(decoded.getSeconds()).toBe(43);
  });
});

describe("decodeUserData72", () => {
  test("decodes user fields from 72-byte buffer", () => {
    const buf = Buffer.alloc(72);
    buf.writeUInt16LE(42, 0);
    buf.writeUInt8(3, 2);
    Buffer.from("secret", "ascii").copy(buf, 3);
    Buffer.from("Jane Doe", "ascii").copy(buf, 11);
    buf.writeUInt32LE(12345, 35);
    Buffer.from("5011", "ascii").copy(buf, 48);

    const user = decodeUserData72(buf);
    expect(user.uid).toBe(42);
    expect(user.role).toBe(3);
    expect(user.password).toBe("secret");
    expect(user.name).toBe("Jane Doe");
    expect(user.cardno).toBe(12345);
    expect(user.userId).toBe("5011");
  });
});

describe("decodeRecordData40", () => {
  test("decodes attendance with punch and status", () => {
    const buf = Buffer.alloc(40);
    buf.writeUInt16LE(6850, 0);
    Buffer.from("5011", "ascii").copy(buf, 2);
    buf.writeUInt8(1, 26); // fingerprint
    const time = encodeDeviceTime(new Date(2026, 5, 24, 13, 39, 43));
    buf.writeUInt32LE(time, 27);
    buf.writeUInt8(1, 31); // check-in

    const record = decodeRecordData40(buf, "192.168.0.1");
    expect(record.userSn).toBe(6850);
    expect(record.deviceUserId).toBe("5011");
    expect(record.status).toBe(1);
    expect(record.statusLabel).toBe("fingerprint");
    expect(record.punch).toBe(1);
    expect(record.punchLabel).toBe("check-in");
    expect(record.ip).toBe("192.168.0.1");
    expect(record.recordTime.getFullYear()).toBe(2026);
  });

  test("encode round-trips with decodeRecordData40", () => {
    const buf = Buffer.alloc(40);
    buf.writeUInt16LE(6850, 0);
    Buffer.from("5011", "ascii").copy(buf, 2);
    buf.writeUInt8(1, 26);
    const time = encodeDeviceTime(new Date(2026, 5, 24, 13, 39, 43));
    buf.writeUInt32LE(time, 27);
    buf.writeUInt8(1, 31);
    buf[35] = 0xff;

    const record = decodeRecordData40(buf, "192.168.0.1");
    const encoded = encodeRecordData40(record);
    expect(encoded.equals(buf)).toBe(true);
  });

  test("encodeAttendancesBuffer matches parseAttendancesFromBuffer", () => {
    const buf = Buffer.alloc(40);
    buf.writeUInt16LE(6850, 0);
    Buffer.from("5011", "ascii").copy(buf, 2);
    buf.writeUInt8(1, 26);
    buf.writeUInt32LE(encodeDeviceTime(new Date(2026, 5, 24, 13, 39, 43)), 27);
    buf.writeUInt8(1, 31);
    buf[35] = 0xff;

    const payload = Buffer.alloc(44);
    payload.writeUInt32LE(40, 0);
    buf.copy(payload, 4);
    const records = parseAttendancesFromBuffer(payload, 40);
    const encoded = encodeAttendancesBuffer(records, 40);
    expect(encoded.equals(payload)).toBe(true);
  });
});

describe("decodeRecordData16", () => {
  test("decodes 16-byte attendance record", () => {
    const buf = Buffer.alloc(16);
    buf.writeUInt32LE(5011, 0);
    const time = encodeDeviceTime(new Date(2026, 0, 15, 8, 0, 0));
    buf.writeUInt32LE(time, 4);
    buf.writeUInt8(1, 8);
    buf.writeUInt8(0, 9);

    const record = decodeRecordData16(buf);
    expect(record.deviceUserId).toBe(5011);
    expect(record.punch).toBe(0);
    expect(record.punchLabel).toBe("check-out");
  });
});

describe("parse buffers", () => {
  test("parseUsersFromBuffer reads multiple 72-byte users", () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(72 * 2, 0);
    const user1 = Buffer.alloc(72);
    user1.writeUInt16LE(1, 0);
    Buffer.from("user1", "ascii").copy(user1, 48);
    const user2 = Buffer.alloc(72);
    user2.writeUInt16LE(2, 0);
    Buffer.from("user2", "ascii").copy(user2, 48);
    const data = Buffer.concat([header, user1, user2]);

    const users = parseUsersFromBuffer(data, 72);
    expect(users).toHaveLength(2);
    expect(users[0]!.userId).toBe("user1");
    expect(users[1]!.userId).toBe("user2");
  });

  test("parseAttendancesFromBuffer reads 40-byte records", () => {
    const header = Buffer.alloc(4);
    header.writeUInt32LE(40, 0);
    const record = Buffer.alloc(40);
    record.writeUInt16LE(1, 0);
    Buffer.from("99", "ascii").copy(record, 2);
    record.writeUInt8(1, 31);
    const data = Buffer.concat([header, record]);

    const records = parseAttendancesFromBuffer(data, 40);
    expect(records).toHaveLength(1);
    expect(records[0]!.deviceUserId).toBe("99");
    expect(records[0]!.punch).toBe(1);
  });
});

describe("parseFingerprintTemplatesFromBuffer", () => {
  test("parses template index records and summarizes per uid", () => {
    const buf = Buffer.alloc(24);
    buf.writeInt32LE(20, 0);

    buf.writeUInt16LE(10, 4);
    buf.writeUInt16LE(5, 6);
    buf.writeUInt8(0, 8);
    buf.writeUInt8(1, 9);

    buf.writeUInt16LE(10, 14);
    buf.writeUInt16LE(5, 16);
    buf.writeUInt8(2, 18);
    buf.writeUInt8(1, 19);

    const parsed = parseFingerprintTemplatesFromBuffer(buf);
    expect(parsed).toEqual([
      { uid: 5, fingerIndex: 0, valid: 1 },
      { uid: 5, fingerIndex: 2, valid: 1 },
    ]);

    const summary = summarizeFingerprintTemplates(parsed);
    expect(summary.get(5)).toEqual([0, 2]);
  });
});

describe("exportErrorMessage", () => {
  test("returns command name for known values", () => {
    expect(exportErrorMessage(COMMANDS.CMD_CONNECT)).toBe("CMD_CONNECT");
    expect(exportErrorMessage(COMMANDS.CMD_ACK_OK)).toBe("CMD_ACK_OK");
  });

  test("returns unknown for invalid values", () => {
    expect(exportErrorMessage(99999)).toBe("AN UNKNOWN ERROR");
  });
});
