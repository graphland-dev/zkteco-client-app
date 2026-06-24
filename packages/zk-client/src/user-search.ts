import type { User, UserSearchCriteria } from "./types.ts";

function matchString(
  value: string,
  needle: string,
  mode: "exact" | "partial",
): boolean {
  if (mode === "exact") return value === needle;
  return value.toLowerCase().includes(needle.toLowerCase());
}

export function matchesUser(user: User, criteria: UserSearchCriteria): boolean {
  const mode = criteria.match ?? "partial";

  if (criteria.query) {
    const q = criteria.query.trim();
    if (!q) return true;

    const matchesQuery =
      matchString(user.name, q, "partial") ||
      matchString(user.userId, q, "partial") ||
      String(user.uid).includes(q) ||
      (user.cardno !== undefined && String(user.cardno).includes(q));

    if (!matchesQuery) return false;
  }

  if (criteria.uid !== undefined && user.uid !== criteria.uid) return false;

  const userId = criteria.userId ?? criteria.id;
  if (userId !== undefined && !matchString(user.userId, String(userId), mode)) {
    return false;
  }

  if (criteria.name !== undefined && !matchString(user.name, criteria.name, mode)) {
    return false;
  }

  if (criteria.cardno !== undefined && user.cardno !== criteria.cardno) return false;
  if (criteria.role !== undefined && user.role !== criteria.role) return false;

  return true;
}

export function normalizeSearchCriteria(
  input: string | UserSearchCriteria,
): UserSearchCriteria {
  if (typeof input === "string") {
    return { query: input };
  }
  return input;
}
