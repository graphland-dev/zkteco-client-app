/**
 * ZKTeco CommKey auth — ported from pyzk (commpro.c MakeKey).
 */
export function makeCommKey(key: number, sessionId: number, ticks = 50): Buffer {
  let k = 0;
  const password = key >>> 0;
  for (let i = 0; i < 32; i++) {
    if (password & (1 << i)) {
      k = (k << 1) | 1;
    } else {
      k <<= 1;
    }
  }
  k += sessionId;

  const raw = Buffer.alloc(4);
  raw.writeUInt32LE(k >>> 0, 0);

  const bytes = [raw[0]!, raw[1]!, raw[2]!, raw[3]!];
  bytes[0]! ^= "Z".charCodeAt(0);
  bytes[1]! ^= "K".charCodeAt(0);
  bytes[2]! ^= "S".charCodeAt(0);
  bytes[3]! ^= "O".charCodeAt(0);

  // swap 16-bit halves
  const swapped = Buffer.from([bytes[2]!, bytes[3]!, bytes[0]!, bytes[1]!]);

  const tickByte = ticks & 0xff;
  const result = Buffer.alloc(4);
  result[0] = swapped[0]! ^ tickByte;
  result[1] = swapped[1]! ^ tickByte;
  result[2] = tickByte;
  result[3] = swapped[3]! ^ tickByte;
  return result;
}

export function getReplyCommandId(payload: Buffer): number {
  if (payload.length < 2) return -1;
  return payload.readUIntLE(0, 2);
}
