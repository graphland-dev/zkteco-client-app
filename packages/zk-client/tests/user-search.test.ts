import { describe, expect, test } from "bun:test";
import type { User } from "../src/types.ts";
import { matchesUser, normalizeSearchCriteria } from "../src/user-search.ts";

const users: User[] = [
  { uid: 1, role: 0, name: "Alice Smith", userId: "1001", cardno: 111 },
  { uid: 2, role: 3, name: "Bob Jones", userId: "5011", cardno: 222 },
  { uid: 3, role: 0, name: "Rayhan", userId: "5012" },
];

describe("normalizeSearchCriteria", () => {
  test("wraps string as query", () => {
    expect(normalizeSearchCriteria("ray")).toEqual({ query: "ray" });
  });

  test("passes through object", () => {
    const criteria = { userId: "5011", match: "exact" as const };
    expect(normalizeSearchCriteria(criteria)).toBe(criteria);
  });
});

describe("matchesUser", () => {
  test("matches free-text query against name", () => {
    expect(matchesUser(users[2]!, { query: "ray" })).toBe(true);
    expect(matchesUser(users[0]!, { query: "ray" })).toBe(false);
  });

  test("matches free-text query against userId", () => {
    expect(matchesUser(users[1]!, { query: "5011" })).toBe(true);
  });

  test("matches by uid", () => {
    expect(matchesUser(users[1]!, { uid: 2 })).toBe(true);
    expect(matchesUser(users[1]!, { uid: 99 })).toBe(false);
  });

  test("matches userId with exact mode", () => {
    expect(matchesUser(users[1]!, { userId: "5011", match: "exact" })).toBe(true);
    expect(matchesUser(users[1]!, { userId: "501", match: "exact" })).toBe(false);
  });

  test("matches userId with partial mode", () => {
    expect(matchesUser(users[1]!, { userId: "501", match: "partial" })).toBe(true);
  });

  test("matches id alias", () => {
    expect(matchesUser(users[1]!, { id: "5011", match: "exact" })).toBe(true);
  });

  test("matches cardno and role", () => {
    expect(matchesUser(users[1]!, { cardno: 222 })).toBe(true);
    expect(matchesUser(users[1]!, { role: 3 })).toBe(true);
  });

  test("combines filters with AND logic", () => {
    expect(matchesUser(users[1]!, { name: "Bob", role: 3 })).toBe(true);
    expect(matchesUser(users[1]!, { name: "Bob", role: 0 })).toBe(false);
  });
});
