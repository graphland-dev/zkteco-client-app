/**
 * Date formatting and parsing without date-fns — Intl + small pattern helpers.
 */

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

export function isValidDateValue(value: unknown): value is Date {
  return value instanceof Date && isValidDate(value);
}

function hour12Parts(d: Date): { hour12: number; minute: number; period: "AM" | "PM" } {
  const h = d.getHours();
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: d.getMinutes(), period };
}

function formatTime12(d: Date, padHour: boolean): string {
  const { hour12, minute, period } = hour12Parts(d);
  const h = padHour ? pad2(hour12) : String(hour12);
  return `${h}:${pad2(minute)} ${period}`;
}

function formatTime24(d: Date, withSeconds: boolean): string {
  const base = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad2(d.getSeconds())}` : base;
}

const FORMATTERS: Record<string, (d: Date) => string> = {
  "EEEE, MMMM d, yyyy h:mm a": (d) => {
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d);
    const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(d);
    return `${weekday}, ${month} ${d.getDate()}, ${d.getFullYear()} ${formatTime12(d, false)}`;
  },
  "MMMM d, yyyy": (d) => {
    const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(d);
    return `${month} ${d.getDate()}, ${d.getFullYear()}`;
  },
  "MMM d, yyyy": (d) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`,
  "MMM d": (d) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`,
  "h:mm a": (d) => formatTime12(d, false),
  "yyyy-MM-dd": (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
  "dd/MM/yyyy HH:mm": (d) =>
    `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime24(d, false)}`,
  "dd/MM/yyyy": (d) =>
    `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
  "yyyy-MM-dd hh:mm a": (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${formatTime12(d, true)}`,
  PPP: (d) =>
    new Intl.DateTimeFormat(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(d),
  "PPP p": (d) => {
    const date = FORMATTERS.PPP(d);
    const time = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(d);
    return `${date} ${time}`;
  },
};

export function formatDatePattern(date: Date, pattern: string): string {
  const formatter = FORMATTERS[pattern];
  if (formatter) return formatter(date);
  return date.toString();
}

export function formatIsoDateOnly(date: Date): string {
  return FORMATTERS["yyyy-MM-dd"](date);
}

const DISTANCE_UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: "year", seconds: 31536000 },
  { unit: "month", seconds: 2592000 },
  { unit: "week", seconds: 604800 },
  { unit: "day", seconds: 86400 },
  { unit: "hour", seconds: 3600 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

function formatRelativeUnit(value: number, unit: Intl.RelativeTimeFormatUnit): string {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  return rtf
    .formatToParts(-value, unit)
    .map((part) =>
      part.type === "literal" ? part.value.replace(/\s*ago\s*$/i, "").trim() : part.value,
    )
    .join("")
    .trim();
}

/** Human-readable elapsed time from `date` until now (e.g. "2 hours"). */
export function formatDistanceToNow(
  date: Date,
  options?: { addSuffix?: boolean; baseDate?: Date },
): string {
  if (!isValidDate(date)) return "";
  const base = options?.baseDate ?? new Date();
  const diffSec = Math.round((base.getTime() - date.getTime()) / 1000);

  if (diffSec < 45) {
    const label = "less than a minute";
    return options?.addSuffix ? `${label} ago` : label;
  }

  for (const { unit, seconds } of DISTANCE_UNITS) {
    const value = Math.floor(diffSec / seconds);
    if (value >= 1) {
      const distance = formatRelativeUnit(value, unit);
      return options?.addSuffix ? `${distance} ago` : distance;
    }
  }

  const label = "less than a minute";
  return options?.addSuffix ? `${label} ago` : label;
}

type ParseRule = {
  pattern: string;
  parse: (input: string) => Date | null;
};

function parseYmd(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date | null {
  const d = new Date(year, month - 1, day, hour, minute, second);
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return isValidDate(d) ? d : null;
}

function parse12HourTime(
  hour12: number,
  minute: number,
  period: string,
): { hour: number; minute: number } | null {
  const p = period.toUpperCase();
  if (p !== "AM" && p !== "PM") return null;
  if (hour12 < 1 || hour12 > 12 || minute < 0 || minute > 59) return null;
  let hour =
    p === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return { hour, minute };
}

function monthIndexShort(name: string): number | null {
  const i = MONTHS_SHORT.findIndex(
    (m) => m.toLowerCase() === name.slice(0, 3).toLowerCase(),
  );
  return i >= 0 ? i : null;
}

function monthIndexLong(name: string): number | null {
  for (let i = 0; i < 12; i++) {
    const long = new Intl.DateTimeFormat(undefined, { month: "long" }).format(
      new Date(2020, i, 1),
    );
    if (long.toLowerCase() === name.toLowerCase()) return i;
  }
  return null;
}

const PARSE_RULES: ParseRule[] = [
  {
    pattern: "yyyy-MM-dd hh:mm a",
    parse: (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})\s+(AM|PM)$/i.exec(s);
      if (!m) return null;
      const t = parse12HourTime(Number(m[4]), Number(m[5]), m[6]);
      if (!t) return null;
      return parseYmd(Number(m[1]), Number(m[2]), Number(m[3]), t.hour, t.minute);
    },
  },
  {
    pattern: "yyyy-MM-dd h:mm a",
    parse: (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(s);
      if (!m) return null;
      const t = parse12HourTime(Number(m[4]), Number(m[5]), m[6]);
      if (!t) return null;
      return parseYmd(Number(m[1]), Number(m[2]), Number(m[3]), t.hour, t.minute);
    },
  },
  {
    pattern: "yyyy-MM-dd HH:mm:ss",
    parse: (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6]),
      );
    },
  },
  {
    pattern: "yyyy-MM-dd HH:mm",
    parse: (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
      );
    },
  },
  {
    pattern: "yyyy-MM-dd",
    parse: (s) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(Number(m[1]), Number(m[2]), Number(m[3]));
    },
  },
  {
    pattern: "yyyy/MM/dd",
    parse: (s) => {
      const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(Number(m[1]), Number(m[2]), Number(m[3]));
    },
  },
  {
    pattern: "yyyy/MM/dd hh:mm a",
    parse: (s) => {
      const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+(AM|PM)$/i.exec(s);
      if (!m) return null;
      const t = parse12HourTime(Number(m[4]), Number(m[5]), m[6]);
      if (!t) return null;
      return parseYmd(Number(m[1]), Number(m[2]), Number(m[3]), t.hour, t.minute);
    },
  },
  {
    pattern: "yyyy/MM/dd HH:mm",
    parse: (s) => {
      const m = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(
        Number(m[1]),
        Number(m[2]),
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
      );
    },
  },
  {
    pattern: "dd-MM-yyyy",
    parse: (s) => {
      const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
      if (!m) return null;
      return parseYmd(Number(m[3]), Number(m[2]), Number(m[1]));
    },
  },
  {
    pattern: "dd/MM/yyyy",
    parse: (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (!m) return null;
      return parseYmd(Number(m[3]), Number(m[2]), Number(m[1]));
    },
  },
  {
    pattern: "dd/MM/yyyy hh:mm a",
    parse: (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+(AM|PM)$/i.exec(s);
      if (!m) return null;
      const t = parse12HourTime(Number(m[4]), Number(m[5]), m[6]);
      if (!t) return null;
      return parseYmd(Number(m[3]), Number(m[2]), Number(m[1]), t.hour, t.minute);
    },
  },
  {
    pattern: "dd/MM/yyyy HH:mm",
    parse: (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(
        Number(m[3]),
        Number(m[2]),
        Number(m[1]),
        Number(m[4]),
        Number(m[5]),
      );
    },
  },
  {
    pattern: "MM/dd/yyyy",
    parse: (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
      if (!m) return null;
      return parseYmd(Number(m[3]), Number(m[1]), Number(m[2]));
    },
  },
  {
    pattern: "MM/dd/yyyy hh:mm a",
    parse: (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})\s+(AM|PM)$/i.exec(s);
      if (!m) return null;
      const t = parse12HourTime(Number(m[4]), Number(m[5]), m[6]);
      if (!t) return null;
      return parseYmd(Number(m[3]), Number(m[1]), Number(m[2]), t.hour, t.minute);
    },
  },
  {
    pattern: "MM/dd/yyyy HH:mm",
    parse: (s) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
      if (!m) return null;
      return parseYmd(
        Number(m[3]),
        Number(m[1]),
        Number(m[2]),
        Number(m[4]),
        Number(m[5]),
      );
    },
  },
  {
    pattern: "MMM d, yyyy",
    parse: (s) => {
      const m = /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/.exec(s);
      if (!m) return null;
      const month = monthIndexShort(m[1]);
      if (month === null) return null;
      return parseYmd(Number(m[3]), month + 1, Number(m[2]));
    },
  },
  {
    pattern: "MMMM d, yyyy",
    parse: (s) => {
      const m = /^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/.exec(s);
      if (!m) return null;
      const month = monthIndexLong(m[1]);
      if (month === null) return null;
      return parseYmd(Number(m[3]), month + 1, Number(m[2]));
    },
  },
  {
    pattern: "d MMM yyyy",
    parse: (s) => {
      const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(s);
      if (!m) return null;
      const month = monthIndexShort(m[2]);
      if (month === null) return null;
      return parseYmd(Number(m[3]), month + 1, Number(m[1]));
    },
  },
  {
    pattern: "d MMMM yyyy",
    parse: (s) => {
      const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
      if (!m) return null;
      const month = monthIndexLong(m[2]);
      if (month === null) return null;
      return parseYmd(Number(m[3]), month + 1, Number(m[1]));
    },
  },
  {
    pattern: "MMM d, yyyy h:mm a",
    parse: (s) => {
      const m = /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i.exec(
        s,
      );
      if (!m) return null;
      const month = monthIndexShort(m[1]);
      if (month === null) return null;
      const t = parse12HourTime(Number(m[4]), Number(m[5]), m[6]);
      if (!t) return null;
      return parseYmd(Number(m[3]), month + 1, Number(m[2]), t.hour, t.minute);
    },
  },
  {
    pattern: "MMM d, yyyy HH:mm",
    parse: (s) => {
      const m = /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{2}):(\d{2})$/.exec(s);
      if (!m) return null;
      const month = monthIndexShort(m[1]);
      if (month === null) return null;
      return parseYmd(
        Number(m[3]),
        month + 1,
        Number(m[2]),
        Number(m[4]),
        Number(m[5]),
      );
    },
  },
];

const DATE_ONLY_PATTERNS = [
  "yyyy-MM-dd",
  "yyyy/MM/dd",
  "dd-MM-yyyy",
  "dd/MM/yyyy",
  "MM/dd/yyyy",
  "MMM d, yyyy",
  "MMMM d, yyyy",
  "d MMM yyyy",
  "d MMMM yyyy",
];

const DATETIME_PATTERNS = [
  "yyyy-MM-dd hh:mm a",
  "yyyy-MM-dd h:mm a",
  "yyyy-MM-dd HH:mm:ss",
  "yyyy-MM-dd HH:mm",
  "yyyy/MM/dd hh:mm a",
  "yyyy/MM/dd HH:mm",
  "dd/MM/yyyy hh:mm a",
  "dd/MM/yyyy HH:mm",
  "MM/dd/yyyy hh:mm a",
  "MM/dd/yyyy HH:mm",
  "MMM d, yyyy h:mm a",
  "MMM d, yyyy HH:mm",
];

const PARSE_RULE_BY_PATTERN = new Map(PARSE_RULES.map((r) => [r.pattern, r]));

export function tryParseDateInput(input: string, withTime: boolean): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns = withTime
    ? [...DATETIME_PATTERNS, ...DATE_ONLY_PATTERNS]
    : DATE_ONLY_PATTERNS;

  for (const pattern of patterns) {
    const rule = PARSE_RULE_BY_PATTERN.get(pattern);
    if (!rule) continue;
    const parsed = rule.parse(trimmed);
    if (parsed) return parsed;
  }

  const fallback = new Date(trimmed);
  return isValidDate(fallback) ? fallback : null;
}
