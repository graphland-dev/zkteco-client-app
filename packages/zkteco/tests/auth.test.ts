import { describe, expect, test } from "bun:test";
import { getReplyCommandId, makeCommKey } from "../src/auth.ts";

describe("makeCommKey", () => {
  test("returns 4-byte buffer", () => {
    const key = makeCommKey(0, 32031);
    expect(key).toHaveLength(4);
  });

  test("matches known vector (key=0, session=32031, ticks=50)", () => {
    const key = makeCommKey(0, 32031, 50);
    expect(key.toString("hex")).toBe("617d3204");
  });

  test("is deterministic for same inputs", () => {
    const a = makeCommKey(0, 32031, 50);
    const b = makeCommKey(0, 32031, 50);
    expect(a.equals(b)).toBe(true);
  });

  test("produces different output for different comm keys", () => {
    const a = makeCommKey(0, 32031);
    const b = makeCommKey(12345, 32031);
    expect(a.equals(b)).toBe(false);
  });
});

describe("getReplyCommandId", () => {
  test("reads command id from payload", () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt16LE(2000, 0);
    expect(getReplyCommandId(buf)).toBe(2000);
  });

  test("returns -1 for empty buffer", () => {
    expect(getReplyCommandId(Buffer.alloc(0))).toBe(-1);
  });
});
