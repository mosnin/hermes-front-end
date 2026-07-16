export type Schedule = {
  enabled: boolean;
  days: number[]; // 0=Sun … 6=Sat
  startMin: number; // minutes from local midnight
  endMin: number;
  tzOffsetMinutes: number; // add to UTC to get local (e.g. -300 = US Eastern)
};

/**
 * Whether `now` (epoch ms) falls inside the schedule's active window. No
 * schedule or a disabled one is always active. Windows may wrap past midnight
 * (endMin <= startMin), in which case the tail spills into the next day.
 */
export function withinSchedule(
  schedule: Schedule | undefined,
  now: number,
): boolean {
  if (!schedule || !schedule.enabled) return true;
  const local = new Date(now + schedule.tzOffsetMinutes * 60_000);
  const day = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();

  const wraps = schedule.endMin <= schedule.startMin;
  if (!wraps) {
    return (
      schedule.days.includes(day) &&
      minutes >= schedule.startMin &&
      minutes < schedule.endMin
    );
  }
  // Overnight window: active from startMin→midnight on an included day, and
  // midnight→endMin on the day AFTER an included day.
  const prevDay = (day + 6) % 7;
  if (schedule.days.includes(day) && minutes >= schedule.startMin) return true;
  if (schedule.days.includes(prevDay) && minutes < schedule.endMin) return true;
  return false;
}

/** Human summary for the UI ("Weekdays 09:00–17:00"). */
export function describeSchedule(schedule: Schedule): string {
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const set = new Set(schedule.days);
  const weekdays = [1, 2, 3, 4, 5].every((d) => set.has(d)) && set.size === 5;
  const label = weekdays
    ? "Weekdays"
    : schedule.days
        .slice()
        .sort()
        .map((d) => names[d])
        .join(", ");
  return `${label} ${fmt(schedule.startMin)}–${fmt(schedule.endMin)}`;
}
