import { describe, expect, test } from "bun:test";
import {
  getPunchLabel,
  getVerifyModeLabel,
  isCheckIn,
  isCheckOut,
} from "../src/attendance.ts";

describe("getPunchLabel", () => {
  test("maps known punch values", () => {
    expect(getPunchLabel(0)).toBe("check-out");
    expect(getPunchLabel(1)).toBe("check-in");
    expect(getPunchLabel(2)).toBe("break-out");
    expect(getPunchLabel(3)).toBe("break-in");
  });

  test("returns unknown label for unmapped values", () => {
    expect(getPunchLabel(99)).toBe("unknown (99)");
  });
});

describe("getVerifyModeLabel", () => {
  test("maps known verify modes", () => {
    expect(getVerifyModeLabel(1)).toBe("fingerprint");
    expect(getVerifyModeLabel(2)).toBe("card");
    expect(getVerifyModeLabel(15)).toBe("face");
  });

  test("returns fallback for unmapped modes", () => {
    expect(getVerifyModeLabel(99)).toBe("mode-99");
  });
});

describe("isCheckIn / isCheckOut", () => {
  test("identifies check-in punches", () => {
    expect(isCheckIn(1)).toBe(true);
    expect(isCheckIn(3)).toBe(true);
    expect(isCheckIn(0)).toBe(false);
  });

  test("identifies check-out punches", () => {
    expect(isCheckOut(0)).toBe(true);
    expect(isCheckOut(2)).toBe(true);
    expect(isCheckOut(1)).toBe(false);
  });
});
