import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { TcpTransport } from "../src/transport/tcp.ts";
import { createTCPHeader } from "../src/protocol.ts";
import { COMMANDS } from "../src/constants.ts";

/**
 * Captured from a real device (SpeedFace-class firmware) with an empty user
 * table: CMD_DATA_WRRQ is answered by a single header-only packet with the
 * undocumented command id 4991 (0x137f) and no payload — no PREPARE_DATA,
 * no CMD_DATA, no ACK_OK. The transport must treat it as an empty dataset,
 * not wait for data that never arrives.
 */
const EMPTY_REPLY_CMD = 4991;

let server: net.Server;
let port: number;

beforeAll(async () => {
  server = net.createServer((socket) => {
    let replyId = 0;
    socket.on("data", (packet: Buffer) => {
      const commandId = packet.readUInt16LE(8);
      const reply =
        commandId === COMMANDS.CMD_DATA_WRRQ
          ? createTCPHeader(EMPTY_REPLY_CMD, 4242, replyId++, "")
          : createTCPHeader(COMMANDS.CMD_ACK_OK, 4242, replyId++, "");
      socket.write(reply);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe("empty dataset reads (device with no users / no logs)", () => {
  test("getUsers resolves to an empty buffer instead of timing out", async () => {
    const transport = new TcpTransport("127.0.0.1", port, 1500);
    await transport.connect();
    try {
      const result = await transport.getUsers();
      expect(result.data.length).toBe(0);
    } finally {
      await transport.disconnect().catch(() => {});
    }
  });

  test("getAttendances resolves to an empty buffer instead of timing out", async () => {
    const transport = new TcpTransport("127.0.0.1", port, 1500);
    await transport.connect();
    try {
      const result = await transport.getAttendances();
      expect(result.data.length).toBe(0);
    } finally {
      await transport.disconnect().catch(() => {});
    }
  });
});
