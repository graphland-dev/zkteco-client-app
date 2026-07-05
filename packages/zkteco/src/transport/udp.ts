import dgram from "node:dgram";
import { makeCommKey, getReplyCommandId } from "../auth.ts";
import {
  COMMANDS,
  MAX_CHUNK,
  RECORD_PACKET_SIZE_UDP,
  REQUEST_DATA,
  USER_PACKET_SIZE_UDP,
} from "../constants.ts";
import {
  checkNotEventUDP,
  createUDPHeader,
  decodeDeviceTime,
  decodeUDPHeader,
  encodeDeviceTime,
  exportErrorMessage,
  assertAckReply,
  decodeRecordRealTimeLog18,
  parseAttendancesFromBuffer,
  parseUsersFromBuffer,
} from "../protocol.ts";
import type { DeviceInfo, ReadBufferResult, RealTimeLog, Transport } from "../types.ts";

export class UdpTransport implements Transport {
  readonly ip: string;
  readonly userPacketSize = USER_PACKET_SIZE_UDP;
  readonly port: number;
  readonly timeout: number;
  readonly inport: number;
  readonly commKey: number;

  private sessionId = 0;
  private replyId = 0;
  private socket: dgram.Socket | null = null;

  constructor(ip: string, port: number, timeout: number, inport: number, commKey = 0) {
    this.ip = ip;
    this.port = port;
    this.timeout = timeout;
    this.inport = inport;
    this.commKey = commKey;
  }

  private createSocket(
    onError?: (error: Error) => void,
    onClose?: () => void,
  ): Promise<dgram.Socket> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      this.socket = socket;
      socket.setMaxListeners(Infinity);

      socket.once("error", (err) => {
        onError?.(err);
        reject(err);
      });

      socket.on("close", () => {
        this.socket = null;
        onClose?.();
      });

      socket.once("listening", () => resolve(socket));
      socket.bind(this.inport);
    });
  }

  private closeSocket(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.removeAllListeners("message");
      this.socket.close(() => resolve());
      setTimeout(() => resolve(), 2000);
    });
  }

  private writeMessage(msg: Buffer, isConnect = false): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket is not connected"));

      let timer: ReturnType<typeof setTimeout> | null = null;
      this.socket.once("message", (data) => {
        if (timer) clearTimeout(timer);
        resolve(data);
      });

      this.socket.send(msg, 0, msg.length, this.port, this.ip, (err) => {
        if (err) return reject(err);
        if (this.timeout) {
          timer = setTimeout(
            () => reject(new Error("TIMEOUT_ON_WRITING_MESSAGE")),
            isConnect ? 2000 : this.timeout,
          );
        }
      });
    });
  }

  private requestData(msg: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket is not connected"));

      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (data: Buffer) => {
        if (timer) clearTimeout(timer);
        this.socket?.removeListener("message", onMessage);
        resolve(data);
      };

      const onMessage = (data: Buffer) => {
        if (checkNotEventUDP(data)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(
          () => reject(new Error("TIMEOUT_ON_RECEIVING_REQUEST_DATA")),
          this.timeout,
        );
        if (data.length >= 13) {
          finish(data);
        } else if (data.length >= 8) {
          // Header-only datagram (e.g. empty dataset on some firmwares,
          // observed as command id 4991 over TCP): nothing else follows.
          finish(data);
        }
      };

      this.socket.on("message", onMessage);
      this.socket.send(msg, 0, msg.length, this.port, this.ip, (err) => {
        if (err) reject(err);
        timer = setTimeout(
          () => reject(new Error("TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA")),
          this.timeout,
        );
      });
    });
  }

  async executeCmd(command: number, data: Buffer | string = ""): Promise<Buffer> {
    if (command === COMMANDS.CMD_CONNECT) {
      this.sessionId = 0;
      this.replyId = 0;
    } else {
      this.replyId++;
    }

    const buf = createUDPHeader(command, this.sessionId, this.replyId, data);
    const reply = await this.writeMessage(
      buf,
      command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT,
    );
    const skipValidation =
      command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_AUTH;
    if (!skipValidation) {
      assertAckReply(reply, exportErrorMessage(command));
    }
    if (command === COMMANDS.CMD_CONNECT && reply.length >= 6) {
      this.sessionId = reply.readUInt16LE(4);
    }
    return reply;
  }

  private sendChunkRequest(start: number, size: number): void {
    this.replyId++;
    const reqData = Buffer.alloc(8);
    reqData.writeUInt32LE(start, 0);
    reqData.writeUInt32LE(size, 4);
    const buf = createUDPHeader(COMMANDS.CMD_DATA_RDY, this.sessionId, this.replyId, reqData);
    this.socket?.send(buf, 0, buf.length, this.port, this.ip);
  }

  private readWithBuffer(
    reqData: Buffer,
    onProgress?: (received: number, total: number) => void,
  ): Promise<ReadBufferResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket is not connected"));

      this.replyId++;
      const buf = createUDPHeader(COMMANDS.CMD_DATA_WRRQ, this.sessionId, this.replyId, reqData);

      this.requestData(buf)
        .then((reply) => {
          const header = decodeUDPHeader(reply.subarray(0, 8));

          if (header.commandId === COMMANDS.CMD_DATA) {
            resolve({ data: reply.subarray(8) });
            return;
          }

          const recvData = reply.subarray(8);

          // Header-only reply with no size payload: the dataset is empty.
          // Some firmwares answer CMD_DATA_WRRQ on an empty table with an
          // undocumented ack instead of PREPARE_DATA.
          if (
            recvData.length < 5 &&
            header.commandId !== COMMANDS.CMD_ACK_ERROR &&
            header.commandId !== COMMANDS.CMD_ACK_ERROR_CMD &&
            header.commandId !== COMMANDS.CMD_ACK_ERROR_INIT &&
            header.commandId !== COMMANDS.CMD_ACK_ERROR_DATA
          ) {
            resolve({ data: Buffer.alloc(0) });
            return;
          }

          if (
            header.commandId !== COMMANDS.CMD_ACK_OK &&
            header.commandId !== COMMANDS.CMD_PREPARE_DATA
          ) {
            reject(new Error(`ERROR_IN_UNHANDLE_CMD ${exportErrorMessage(header.commandId)}`));
            return;
          }

          const size = recvData.readUIntLE(1, 4);
          const remain = size % MAX_CHUNK;
          const numberChunks = Math.round(size - remain) / MAX_CHUNK;
          let totalBuffer = Buffer.alloc(0);
          const timeout = 3000;

          let timer = setTimeout(() => {
            finish(totalBuffer, new Error("TIMEOUT WHEN RECEIVING PACKET"));
          }, timeout);

          const finish = (data: Buffer, err: Error | null = null) => {
            this.socket?.removeListener("message", onMessage);
            if (timer) clearTimeout(timer);
            resolve({ data, err });
          };

          const onMessage = (packet: Buffer) => {
            if (checkNotEventUDP(packet)) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(
              () =>
                finish(
                  totalBuffer,
                  new Error(`TIMEOUT !! ${((size - totalBuffer.length) / size) * 100}% REMAIN !`),
                ),
              timeout,
            );

            const pktHeader = decodeUDPHeader(packet);
            if (pktHeader.commandId === COMMANDS.CMD_DATA) {
              totalBuffer = Buffer.concat([totalBuffer, packet.subarray(8)]);
              onProgress?.(totalBuffer.length, size);
            } else if (pktHeader.commandId === COMMANDS.CMD_ACK_OK && totalBuffer.length === size) {
              finish(totalBuffer);
            } else if (
              pktHeader.commandId !== COMMANDS.CMD_PREPARE_DATA &&
              pktHeader.commandId !== COMMANDS.CMD_ACK_OK
            ) {
              finish(
                Buffer.alloc(0),
                new Error(`ERROR_IN_UNHANDLE_CMD ${exportErrorMessage(pktHeader.commandId)}`),
              );
            }
          };

          this.socket!.on("message", onMessage);

          for (let i = 0; i <= numberChunks; i++) {
            if (i === numberChunks) {
              this.sendChunkRequest(numberChunks * MAX_CHUNK, remain);
            } else {
              this.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK);
            }
          }
        })
        .catch(reject);
    });
  }

  private async withFreeData<T>(fn: () => Promise<T>): Promise<T> {
    if (this.socket) await this.freeData();
    const result = await fn();
    if (this.socket) await this.freeData();
    return result;
  }

  async connect(onError?: (error: Error) => void, onClose?: () => void): Promise<void> {
    await this.createSocket(onError, onClose);
    const reply = await this.executeCmd(COMMANDS.CMD_CONNECT, "");
    if (!reply || reply.length < 6) {
      throw new Error("NO_REPLY_ON_CMD_CONNECT");
    }

    const commandId = getReplyCommandId(reply);
    this.sessionId = reply.readUInt16LE(4);

    if (commandId === COMMANDS.CMD_ACK_UNAUTH) {
      const authReply = await this.executeCmd(
        COMMANDS.CMD_AUTH,
        makeCommKey(this.commKey, this.sessionId),
      );
      if (getReplyCommandId(authReply) === COMMANDS.CMD_ACK_UNAUTH) {
        throw new Error(
          "Invalid communication key (commKey). Set the correct commKey in ZKTecoClient options.",
        );
      }
      assertAckReply(authReply, "CMD_AUTH");
    } else if (commandId !== COMMANDS.CMD_ACK_OK) {
      throw new Error(
        `Invalid connect response: ${exportErrorMessage(commandId)} (wrong port or not a ZKTeco device?)`,
      );
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.executeCmd(COMMANDS.CMD_EXIT, "");
    } catch {
      // ignore
    }
    await this.closeSocket();
  }

  async freeData(): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_FREE_DATA, "");
  }

  async disableDevice(): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);
  }

  async enableDevice(): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_ENABLEDEVICE, "");
  }

  async refreshData(): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_REFRESHDATA, "");
  }

  async getInfo(): Promise<DeviceInfo> {
    const data = await this.executeCmd(COMMANDS.CMD_GET_FREE_SIZES, "");
    if (data.length < 76) {
      throw new Error(
        "Invalid getInfo response: payload too short (wrong port or not a ZKTeco device?)",
      );
    }
    return {
      userCounts: data.readUIntLE(24, 4),
      logCounts: data.readUIntLE(40, 4),
      logCapacity: data.readUIntLE(72, 4),
    };
  }

  async getUsers(): Promise<ReadBufferResult> {
    return this.withFreeData(() => this.readWithBuffer(REQUEST_DATA.GET_USERS));
  }

  async getFingerprintTemplates(): Promise<ReadBufferResult> {
    return this.withFreeData(() =>
      this.readWithBuffer(REQUEST_DATA.GET_FINGERPRINT_TEMPLATES),
    );
  }

  async getAttendances(
    onProgress?: (received: number, total: number) => void,
  ): Promise<ReadBufferResult> {
    return this.withFreeData(() =>
      this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, onProgress),
    );
  }

  async clearAttendanceLog(): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_CLEAR_ATTLOG, "");
  }

  async clearDeviceData(): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_CLEAR_DATA, "");
  }

  async sendWithBuffer(buffer: Buffer): Promise<void> {
    await this.freeData();
    const size = buffer.length;
    const prep = Buffer.alloc(4);
    prep.writeUInt32LE(size, 0);
    await this.executeCmd(COMMANDS.CMD_PREPARE_DATA, prep);

    let offset = 0;
    while (offset < size) {
      const chunk = buffer.subarray(offset, offset + MAX_CHUNK);
      await this.executeCmd(COMMANDS.CMD_DATA, chunk);
      offset += chunk.length;
    }
  }

  async setUser(payload: Buffer): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_USER_WRQ, payload);
  }

  async deleteUser(uid: number): Promise<Buffer> {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(uid, 0);
    return this.executeCmd(COMMANDS.CMD_DELETE_USER, buf);
  }

  async openDoor(delaySec: number): Promise<Buffer> {
    return this.executeCmd(COMMANDS.CMD_UNLOCK, String(delaySec));
  }

  async getTime(): Promise<Date> {
    const data = await this.executeCmd(COMMANDS.CMD_GET_TIME, "");
    return decodeDeviceTime(data.readUIntLE(0, 4));
  }

  async setTime(date: Date): Promise<Buffer> {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(encodeDeviceTime(date), 0);
    return this.executeCmd(COMMANDS.CMD_SET_TIME, buf);
  }

  getRealTimeLogs(callback: (log: RealTimeLog) => void): void {
    if (!this.socket) return;
    this.replyId++;
    const buf = createUDPHeader(
      COMMANDS.CMD_REG_EVENT,
      this.sessionId,
      this.replyId,
      REQUEST_DATA.GET_REAL_TIME_EVENT,
    );
    this.socket.send(buf, 0, buf.length, this.port, this.ip);
    if (this.socket.listenerCount("message") < 2) {
      this.socket.on("message", (data) => {
        if (!checkNotEventUDP(data) || data.length !== 18) return;
        callback(decodeRecordRealTimeLog18(data));
      });
    }
  }

  parseUsers(data: Buffer) {
    return parseUsersFromBuffer(data, USER_PACKET_SIZE_UDP, this.ip);
  }

  parseAttendances(data: Buffer) {
    return parseAttendancesFromBuffer(data, RECORD_PACKET_SIZE_UDP, this.ip);
  }
}
