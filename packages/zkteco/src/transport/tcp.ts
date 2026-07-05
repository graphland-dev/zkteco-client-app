import net from "node:net";
import { makeCommKey, getReplyCommandId } from "../auth.ts";
import {
  COMMANDS,
  MAX_CHUNK,
  RECORD_PACKET_SIZE_TCP,
  REQUEST_DATA,
  USER_PACKET_SIZE_TCP,
} from "../constants.ts";
import {
  checkNotEventTCP,
  createTCPHeader,
  decodeDeviceTime,
  decodeTCPHeader,
  encodeDeviceTime,
  exportErrorMessage,
  assertAckReply,
  decodeRecordRealTimeLog52,
  parseAttendancesFromBuffer,
  parseUsersFromBuffer,
  removeTcpHeader,
} from "../protocol.ts";
import type {
  DeviceInfo,
  ReadBufferResult,
  RealTimeLog,
  Transport,
} from "../types.ts";

export class TcpTransport implements Transport {
  readonly ip: string;
  readonly userPacketSize = USER_PACKET_SIZE_TCP;
  readonly port: number;
  readonly timeout: number;
  readonly commKey: number;

  private sessionId = 0;
  private replyId = 0;
  private socket: net.Socket | null = null;

  constructor(ip: string, port: number, timeout: number, commKey = 0) {
    this.ip = ip;
    this.port = port;
    this.timeout = timeout;
    this.commKey = commKey;
  }

  private createSocket(
    onError?: (error: Error) => void,
    onClose?: () => void,
  ): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      this.socket = socket;

      socket.once("error", (err) => {
        onError?.(err);
        reject(err);
      });

      socket.once("connect", () => resolve(socket));

      socket.once("close", () => {
        this.socket = null;
        onClose?.();
      });

      if (this.timeout) socket.setTimeout(this.timeout);
      socket.connect(this.port, this.ip);
    });
  }

  private closeSocket(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve();
        return;
      }
      this.socket.removeAllListeners("data");
      this.socket.end(() => resolve());
      setTimeout(() => resolve(), 2000);
    });
  }

  private writeMessage(msg: Buffer, isConnect = false): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket is not connected"));

      let timer: ReturnType<typeof setTimeout> | null = null;
      this.socket.once("data", (data: Buffer) => {
        if (timer) clearTimeout(timer);
        resolve(data);
      });

      this.socket.write(msg, (err) => {
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
      let replyBuffer = Buffer.alloc(0);

      const finish = (data: Buffer) => {
        this.socket?.removeListener("data", onData);
        if (timer) clearTimeout(timer);
        resolve(data);
      };

      const onData = (data: Buffer) => {
        replyBuffer = Buffer.concat([replyBuffer, data]);
        if (checkNotEventTCP(data)) return;

        if (timer) clearTimeout(timer);
        const header = decodeTCPHeader(replyBuffer.subarray(0, 16));

        if (header.commandId === COMMANDS.CMD_DATA) {
          timer = setTimeout(() => finish(replyBuffer), 1000);
        } else {
          timer = setTimeout(
            () => reject(new Error("TIMEOUT_ON_RECEIVING_REQUEST_DATA")),
            this.timeout,
          );
          const packetLength = data.readUIntLE(4, 2);
          if (packetLength > 8) {
            finish(data);
          } else if (replyBuffer.length >= 8 + packetLength) {
            // Header-only reply (e.g. empty dataset on some firmwares,
            // observed as command id 4991): nothing else will arrive.
            finish(replyBuffer);
          }
        }
      };

      this.socket.on("data", onData);
      this.socket.write(msg, (err) => {
        if (err) reject(err);
        timer = setTimeout(
          () =>
            reject(
              new Error("TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA"),
            ),
          this.timeout,
        );
      });
    });
  }

  async executeCmd(
    command: number,
    data: Buffer | string = "",
  ): Promise<Buffer> {
    if (command === COMMANDS.CMD_CONNECT) {
      this.sessionId = 0;
      this.replyId = 0;
    } else {
      this.replyId++;
    }

    const buf = createTCPHeader(command, this.sessionId, this.replyId, data);
    const reply = await this.writeMessage(
      buf,
      command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT,
    );
    const payload = removeTcpHeader(reply);
    const skipValidation =
      command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_AUTH;
    if (!skipValidation) {
      assertAckReply(payload, exportErrorMessage(command));
    }
    if (command === COMMANDS.CMD_CONNECT && payload.length >= 6) {
      this.sessionId = payload.readUInt16LE(4);
    }
    return payload;
  }

  private sendChunkRequest(start: number, size: number): void {
    this.replyId++;
    const reqData = Buffer.alloc(8);
    reqData.writeUInt32LE(start, 0);
    reqData.writeUInt32LE(size, 4);
    const buf = createTCPHeader(
      COMMANDS.CMD_DATA_RDY,
      this.sessionId,
      this.replyId,
      reqData,
    );
    this.socket?.write(buf);
  }

  private readWithBuffer(
    reqData: Buffer,
    onProgress?: (received: number, total: number) => void,
  ): Promise<ReadBufferResult> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error("Socket is not connected"));

      this.replyId++;
      const buf = createTCPHeader(
        COMMANDS.CMD_DATA_WRRQ,
        this.sessionId,
        this.replyId,
        reqData,
      );

      this.requestData(buf)
        .then((reply) => {
          const header = decodeTCPHeader(reply.subarray(0, 16));

          if (header.commandId === COMMANDS.CMD_DATA) {
            resolve({ data: reply.subarray(16) });
            return;
          }

          const recvData = reply.subarray(16);

          // Header-only reply with no size payload: the dataset is empty.
          // Some firmwares answer CMD_DATA_WRRQ on an empty table with an
          // undocumented ack (observed: 4991) instead of PREPARE_DATA.
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
            reject(
              new Error(
                `ERROR_IN_UNHANDLE_CMD ${exportErrorMessage(header.commandId)}`,
              ),
            );
            return;
          }

          const size = recvData.readUIntLE(1, 4);
          const remain = size % MAX_CHUNK;
          const numberChunks = Math.round(size - remain) / MAX_CHUNK;
          let totalPackets = numberChunks + (remain > 0 ? 1 : 0);
          let replyData = Buffer.alloc(0);
          let totalBuffer = Buffer.alloc(0);
          let realTotalBuffer = Buffer.alloc(0);
          const timeout = 10000;

          let timer = setTimeout(() => {
            finish(replyData, new Error("TIMEOUT WHEN RECEIVING PACKET"));
          }, timeout);

          const finish = (data: Buffer, err: Error | null = null) => {
            if (timer) clearTimeout(timer);
            resolve({ data, err });
          };

          const onData = (packet: Buffer) => {
            if (checkNotEventTCP(packet)) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(
              () =>
                finish(
                  replyData,
                  new Error(`TIME OUT !! ${totalPackets} PACKETS REMAIN !`),
                ),
              timeout,
            );

            totalBuffer = Buffer.concat([totalBuffer, packet]);
            const packetLength = totalBuffer.readUIntLE(4, 2);
            if (totalBuffer.length >= 8 + packetLength) {
              realTotalBuffer = Buffer.concat([
                realTotalBuffer,
                totalBuffer.subarray(16, 8 + packetLength),
              ]);
              totalBuffer = totalBuffer.subarray(8 + packetLength);

              if (
                (totalPackets > 1 &&
                  realTotalBuffer.length === MAX_CHUNK + 8) ||
                (totalPackets === 1 && realTotalBuffer.length === remain + 8)
              ) {
                replyData = Buffer.concat([
                  replyData,
                  realTotalBuffer.subarray(8),
                ]);
                totalBuffer = Buffer.alloc(0);
                realTotalBuffer = Buffer.alloc(0);
                totalPackets -= 1;
                onProgress?.(replyData.length, size);
                if (totalPackets <= 0) finish(replyData);
              }
            }
          };

          this.socket!.once("close", () => {
            finish(replyData, new Error("Socket is disconnected unexpectedly"));
          });
          this.socket!.on("data", onData);

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

  async connect(
    onError?: (error: Error) => void,
    onClose?: () => void,
  ): Promise<void> {
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
    return this.executeCmd(
      COMMANDS.CMD_DISABLEDEVICE,
      REQUEST_DATA.DISABLE_DEVICE,
    );
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
    const buf = createTCPHeader(
      COMMANDS.CMD_REG_EVENT,
      this.sessionId,
      this.replyId,
      Buffer.from([0x01, 0x00, 0x00, 0x00]),
    );
    this.socket.write(buf);
    if (this.socket.listenerCount("data") === 0) {
      this.socket.on("data", (data: Buffer) => {
        if (!checkNotEventTCP(data) || data.length <= 16) return;
        callback(decodeRecordRealTimeLog52(data));
      });
    }
  }

  parseUsers(data: Buffer) {
    return parseUsersFromBuffer(data, USER_PACKET_SIZE_TCP, this.ip);
  }

  parseAttendances(data: Buffer) {
    return parseAttendancesFromBuffer(data, RECORD_PACKET_SIZE_TCP, this.ip);
  }
}
