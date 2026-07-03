import type { AttendanceFilter, AttendanceRecord } from "./types.ts";

export function matchesAttendance(
  record: AttendanceRecord,
  filter: AttendanceFilter,
): boolean {
  if (filter.userId !== undefined) {
    if (String(record.deviceUserId) !== String(filter.userId)) return false;
  }

  if (filter.uid !== undefined) {
    if (record.userSn !== filter.uid) return false;
  }

  if (filter.from && record.recordTime < filter.from) return false;
  if (filter.to && record.recordTime > filter.to) return false;

  return true;
}

export function filterAttendances(
  records: AttendanceRecord[],
  filter: AttendanceFilter,
): AttendanceRecord[] {
  return records.filter((record) => matchesAttendance(record, filter));
}
