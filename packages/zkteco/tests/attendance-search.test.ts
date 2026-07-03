import { describe, expect, test } from "bun:test";
import type { AttendanceRecord } from "../src/types.ts";
import { filterAttendances, matchesAttendance } from "../src/attendance-search.ts";

const records: AttendanceRecord[] = [
  {
    userSn: 1,
    deviceUserId: "5011",
    recordTime: new Date("2026-06-24T07:39:43Z"),
    punch: 1,
    punchLabel: "check-in",
  },
  {
    userSn: 2,
    deviceUserId: "5011",
    recordTime: new Date("2026-06-24T17:00:00Z"),
    punch: 0,
    punchLabel: "check-out",
  },
  {
    userSn: 3,
    deviceUserId: "1001",
    recordTime: new Date("2026-06-24T08:00:00Z"),
    punch: 1,
    punchLabel: "check-in",
  },
];

describe("matchesAttendance", () => {
  test("filters by userId", () => {
    expect(matchesAttendance(records[0]!, { userId: "5011" })).toBe(true);
    expect(matchesAttendance(records[2]!, { userId: "5011" })).toBe(false);
  });

  test("filters by uid", () => {
    expect(matchesAttendance(records[0]!, { uid: 1 })).toBe(true);
    expect(matchesAttendance(records[0]!, { uid: 2 })).toBe(false);
  });

  test("filters by date range", () => {
    expect(
      matchesAttendance(records[0]!, {
        from: new Date("2026-06-24T00:00:00Z"),
        to: new Date("2026-06-24T12:00:00Z"),
      }),
    ).toBe(true);
    expect(
      matchesAttendance(records[1]!, {
        from: new Date("2026-06-24T00:00:00Z"),
        to: new Date("2026-06-24T12:00:00Z"),
      }),
    ).toBe(false);
  });
});

describe("filterAttendances", () => {
  test("returns matching records for user", () => {
    const filtered = filterAttendances(records, { userId: "5011" });
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.deviceUserId === "5011")).toBe(true);
  });
});
