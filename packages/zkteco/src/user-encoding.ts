import type { EncodeUserOptions, UserRole } from "./types.ts";

const ROLE_NAME_TO_VALUE: Record<string, number> = {
  user: 0,
  enroller: 1,
  admin: 3,
  superadmin: 7,
};

function sanitizeAscii(value: string): string {
  return value.replace(/[^\x00-\x7F]/g, "");
}

function writeAsciiField(buf: Buffer, value: string, offset: number, length: number): void {
  const field = Buffer.alloc(length);
  const clean = sanitizeAscii(value);
  if (clean.length > 0) {
    Buffer.from(clean, "ascii").copy(field, 0, 0, Math.min(clean.length, length));
  }
  field.copy(buf, offset);
}

function toUInt16(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return fallback;
  const num = Number(value);
  if (num < 0) return 0;
  if (num > 0xffff) return 0xffff;
  return num;
}

function toUInt32(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return fallback >>> 0;
  const num = Number(value);
  if (num < 0) return 0;
  if (num > 0xffffffff) return 0xffffffff;
  return num >>> 0;
}

function resolveRoleValue(role?: UserRole): number {
  if (typeof role === "string") {
    return ROLE_NAME_TO_VALUE[role.toLowerCase().trim()] ?? 0;
  }
  return Number(role) || 0;
}

function buildPermissionToken(roleValue: number, enabled = true): number {
  let token = 0;
  if (roleValue & 0x1) token |= 0x02;
  if (roleValue & 0x2) token |= 0x04;
  if (roleValue & 0x4) token |= 0x08;
  if (!enabled) token |= 0x01;
  return token & 0xff;
}

export function encodeUserInfo72(options: EncodeUserOptions): Buffer {
  const payload = Buffer.alloc(72);
  payload.fill(0);

  payload.writeUInt16LE(toUInt16(options.uid), 0);

  const permissionToken =
    options.permissionToken ??
    buildPermissionToken(resolveRoleValue(options.role), options.enabled !== false);
  payload.writeUInt8(permissionToken, 2);

  writeAsciiField(payload, options.password ?? "", 3, 8);
  writeAsciiField(payload, options.name ?? "", 11, 24);
  payload.writeUInt32LE(toUInt32(options.cardNumber ?? options.cardno ?? 0), 35);
  payload.writeUInt8(toUInt16(options.groupNumber ?? options.group ?? 1) & 0xff, 39);
  payload.writeUInt16LE(
    options.useGroupTimezones === false || (options.timezones?.length ?? 0) > 0 ? 1 : 0,
    40,
  );
  const timezones = options.timezones ?? [];
  payload.writeUInt16LE(toUInt16(timezones[0] ?? 0), 42);
  payload.writeUInt16LE(toUInt16(timezones[1] ?? 0), 44);
  payload.writeUInt16LE(toUInt16(timezones[2] ?? 0), 46);
  writeAsciiField(payload, options.userId ?? "", 48, 9);

  return payload;
}

export function encodeUserInfo28(options: EncodeUserOptions): Buffer {
  const payload = Buffer.alloc(28);
  payload.fill(0);

  payload.writeUInt16LE(toUInt16(options.uid), 0);

  const permissionToken =
    options.permissionToken ??
    buildPermissionToken(resolveRoleValue(options.role), options.enabled !== false);
  payload.writeUInt8(permissionToken, 2);

  writeAsciiField(payload, options.password ?? "", 3, 5);
  writeAsciiField(payload, options.name ?? "", 8, 8);
  payload.writeUInt32LE(
    toUInt32(options.userId ?? options.uid, toUInt32(options.uid)),
    24,
  );

  return payload;
}

export function encodeUser(options: EncodeUserOptions, packetSize: number): Buffer {
  return packetSize === 72 ? encodeUserInfo72(options) : encodeUserInfo28(options);
}

export function encodeDeleteUser(uid: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(uid, 0);
  return buf;
}
