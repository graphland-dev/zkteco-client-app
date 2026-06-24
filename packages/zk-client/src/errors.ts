export const ERROR_TYPES = {
  ECONNRESET: "ECONNRESET",
  ECONNREFUSED: "ECONNREFUSED",
  EADDRINUSE: "EADDRINUSE",
  ETIMEDOUT: "ETIMEDOUT",
} as const;

export class ZkError extends Error {
  readonly cause: Error;
  readonly ip: string;
  readonly command: string;

  constructor(cause: Error, command: string, ip: string) {
    super(cause.message);
    this.name = "ZkError";
    this.cause = cause;
    this.command = command;
    this.ip = ip;
  }

  get code(): string | undefined {
    return (this.cause as NodeJS.ErrnoException).code;
  }

  toast(): string {
    if (this.code === ERROR_TYPES.ECONNRESET) {
      return "Another device is connecting to the device so the connection is interrupted";
    }
    if (this.code === ERROR_TYPES.ECONNREFUSED) {
      return "IP of the device is refused";
    }
    return this.message;
  }

  toJSON() {
    return {
      err: { message: this.cause.message, code: this.code },
      ip: this.ip,
      command: this.command,
    };
  }
}

export class ZkNotFoundError extends Error {
  readonly resource: string;
  readonly id: string | number;

  constructor(resource: string, id: string | number) {
    super(`${resource} not found: ${id}`);
    this.name = "ZkNotFoundError";
    this.resource = resource;
    this.id = id;
  }
}

export class ZkConnectionError extends ZkError {
  readonly port: number;

  constructor(cause: Error, ip: string, port: number) {
    super(
      cause,
      "CONNECT",
      ip,
    );
    this.name = "ZkConnectionError";
    this.port = port;
    this.message = `Failed to connect to ZKTeco device at ${ip}:${port}. ${cause.message}`;
  }
}
