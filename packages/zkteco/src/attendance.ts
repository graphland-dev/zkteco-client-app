/** Default punch state labels — device may remap these in admin settings. */
export const PUNCH_LABELS: Record<number, string> = {
  0: "check-out",
  1: "check-in",
  2: "break-out",
  3: "break-in",
  4: "overtime-in",
  5: "overtime-out",
};

/** How the user was verified (fingerprint, card, password, etc.) */
export const VERIFY_MODE_LABELS: Record<number, string> = {
  0: "password",
  1: "fingerprint",
  2: "card",
  4: "password",
  15: "face",
};

export function getPunchLabel(punch: number): string {
  return PUNCH_LABELS[punch] ?? `unknown (${punch})`;
}

export function getVerifyModeLabel(status: number): string {
  return VERIFY_MODE_LABELS[status] ?? `mode-${status}`;
}

export function isCheckIn(punch: number): boolean {
  return punch === 1 || punch === 3;
}

export function isCheckOut(punch: number): boolean {
  return punch === 0 || punch === 2;
}
