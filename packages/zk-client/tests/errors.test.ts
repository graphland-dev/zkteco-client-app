import { describe, expect, test } from "bun:test";
import { ZkConnectionError, ZkError, ZkNotFoundError } from "../src/errors.ts";

describe("ZkError", () => {
  test("wraps cause with command and ip", () => {
    const err = new ZkError(new Error("timeout"), "getUsers", "192.168.0.1");
    expect(err.command).toBe("getUsers");
    expect(err.ip).toBe("192.168.0.1");
    expect(err.cause.message).toBe("timeout");
  });

  test("serializes to JSON", () => {
    const err = new ZkError(Object.assign(new Error("fail"), { code: "ETIMEDOUT" }), "connect", "10.0.0.1");
    const json = err.toJSON();
    expect(json.ip).toBe("10.0.0.1");
    expect(json.command).toBe("connect");
    expect(json.err.code).toBe("ETIMEDOUT");
  });
});

describe("ZkNotFoundError", () => {
  test("includes resource and id", () => {
    const err = new ZkNotFoundError("User", "5011");
    expect(err.message).toBe("User not found: 5011");
    expect(err.resource).toBe("User");
    expect(err.id).toBe("5011");
  });
});

describe("ZkConnectionError", () => {
  test("includes port in message", () => {
    const err = new ZkConnectionError(new Error("refused"), "192.168.0.153", 6523);
    expect(err.port).toBe(6523);
    expect(err.message).toContain("192.168.0.153:6523");
    expect(err.message).toContain("refused");
  });
});
