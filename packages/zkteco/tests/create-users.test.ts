import { describe, expect, test } from "bun:test";
import { ZKTecoClient } from "../src/client.ts";
import type { CreateUserInput, User } from "../src/types.ts";

interface FakeCall {
  op: "disable" | "enable" | "refresh" | "setUser";
}

function makeClient(existingUsers: User[], failUserIds: string[] = []) {
  const client = new ZKTecoClient({ ip: "127.0.0.1" });
  const calls: FakeCall[] = [];
  const writtenUids: number[] = [];

  const transport = {
    userPacketSize: 72,
    disableDevice: async () => {
      calls.push({ op: "disable" });
      return Buffer.alloc(0);
    },
    enableDevice: async () => {
      calls.push({ op: "enable" });
      return Buffer.alloc(0);
    },
    refreshData: async () => {
      calls.push({ op: "refresh" });
      return Buffer.alloc(0);
    },
    setUser: async (payload: Buffer) => {
      calls.push({ op: "setUser" });
      const uid = payload.readUInt16LE(0);
      const userId = payload
        .subarray(48, 57)
        .toString("ascii")
        .replace(/\0+$/, "");
      if (failUserIds.includes(userId)) {
        throw new Error(`device rejected ${userId}`);
      }
      writtenUids.push(uid);
      return Buffer.alloc(0);
    },
  };

  // Inject the fake transport and skip the network entirely.
  (client as unknown as { transport: unknown }).transport = transport;
  client.connectionType = "tcp";
  client.getUsers = async () => existingUsers;

  return { client, calls, writtenUids };
}

const existing: User[] = [
  { uid: 3, userId: "100", name: "Existing", role: 0 },
];

function input(userId: string): CreateUserInput {
  return { userId, name: `User ${userId}` };
}

describe("createUsers", () => {
  test("batches writes with one disable/refresh/enable cycle per batch", async () => {
    const { client, calls, writtenUids } = makeClient(existing);
    const inputs = Array.from({ length: 11 }, (_, i) => input(String(200 + i)));

    const result = await client.createUsers(inputs, { batchSize: 5 });

    expect(result.created.length).toBe(11);
    expect(result.failed.length).toBe(0);

    // 11 users at batchSize 5 -> 3 batches.
    expect(calls.filter((c) => c.op === "disable").length).toBe(3);
    expect(calls.filter((c) => c.op === "refresh").length).toBe(3);
    expect(calls.filter((c) => c.op === "enable").length).toBe(3);
    expect(calls.filter((c) => c.op === "setUser").length).toBe(11);

    // uids continue after the highest existing uid (3).
    expect(writtenUids).toEqual(Array.from({ length: 11 }, (_, i) => 4 + i));
  });

  test("rejects duplicates against device and within the input list", async () => {
    const { client } = makeClient(existing);

    const result = await client.createUsers([
      input("100"), // already on device
      input("201"),
      input("201"), // duplicate within input
    ]);

    expect(result.created.map((u) => u.userId)).toEqual(["201"]);
    expect(result.failed.length).toBe(2);
    expect(result.failed[0]!.error).toContain("already exists");
  });

  test("a mid-batch device error fails that user but continues the rest", async () => {
    const { client, calls } = makeClient(existing, ["202"]);
    const inputs = [input("201"), input("202"), input("203")];

    const result = await client.createUsers(inputs, { batchSize: 5 });

    expect(result.created.map((u) => u.userId)).toEqual(["201", "203"]);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]!.input.userId).toBe("202");
    expect(result.failed[0]!.error).toContain("device rejected");

    // Device is re-enabled even though a write failed.
    expect(calls.at(-1)?.op).toBe("enable");
  });

  test("reports progress for every attempted user", async () => {
    const { client } = makeClient(existing);
    const seen: Array<[number, number]> = [];

    await client.createUsers(
      [input("100"), input("201"), input("202")],
      { onProgress: (done, total) => seen.push([done, total]) },
    );

    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  test("returns empty result without touching the device for empty input", async () => {
    const { client, calls } = makeClient(existing);

    const result = await client.createUsers([]);

    expect(result).toEqual({ created: [], failed: [] });
    expect(calls.length).toBe(0);
  });
});
