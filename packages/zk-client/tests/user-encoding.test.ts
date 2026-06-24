import { describe, expect, test } from "bun:test";
import { decodeUserData72, decodeUserData28 } from "../src/protocol.ts";
import {
  encodeDeleteUser,
  encodeUser,
  encodeUserInfo28,
  encodeUserInfo72,
} from "../src/user-encoding.ts";

describe("encodeUserInfo72", () => {
  test("produces 72-byte buffer", () => {
    const buf = encodeUserInfo72({
      uid: 10,
      userId: "5011",
      name: "Rayhan",
      password: "1234",
      role: "admin",
      cardno: 999,
    });
    expect(buf).toHaveLength(72);
  });

  test("round-trips through decodeUserData72", () => {
    const encoded = encodeUserInfo72({
      uid: 10,
      userId: "5011",
      name: "Rayhan",
      password: "1234",
      role: 3,
      cardno: 999,
    });
    const user = decodeUserData72(encoded);
    expect(user.uid).toBe(10);
    expect(user.userId).toBe("5011");
    expect(user.name).toBe("Rayhan");
    expect(user.password).toBe("1234");
    expect(user.cardno).toBe(999);
  });

  test("defaults uid to 0 when omitted", () => {
    const buf = encodeUserInfo72({ userId: "1", name: "x" } as never);
    expect(buf.readUInt16LE(0)).toBe(0);
  });
});

describe("encodeUserInfo28", () => {
  test("produces 28-byte buffer", () => {
    const buf = encodeUserInfo28({ uid: 5, userId: "5", name: "Test" });
    expect(buf).toHaveLength(28);
  });

  test("round-trips through decodeUserData28", () => {
    const encoded = encodeUserInfo28({ uid: 5, userId: "5", name: "Test" });
    const user = decodeUserData28(encoded);
    expect(user.uid).toBe(5);
    expect(user.name).toBe("Test");
    expect(user.userId).toBe("5");
  });
});

describe("encodeUser", () => {
  test("selects packet size", () => {
    expect(encodeUser({ uid: 1, name: "a" }, 72)).toHaveLength(72);
    expect(encodeUser({ uid: 1, name: "a" }, 28)).toHaveLength(28);
  });
});

describe("encodeDeleteUser", () => {
  test("encodes uid as uint16 LE", () => {
    const buf = encodeDeleteUser(6850);
    expect(buf).toHaveLength(2);
    expect(buf.readUInt16LE(0)).toBe(6850);
  });
});
