"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button, Card, Toggle } from "@/components/ui";
import { useActiveSpace, useCan } from "@/components/active-space";
import { useToast } from "@/components/toast";
import { CalendarClock } from "@/components/icons";
import { cn } from "@/lib/utils";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function fromHHMM(s: string) {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function ScheduleCard() {
  const { spaceId } = useActiveSpace();
  const canAdmin = useCan("admin");
  const toast = useToast();
  const space = useQuery(api.spaces.get, spaceId ? { spaceId } : "skip");
  const setSchedule = useMutation(api.spaces.setSchedule);

  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState(540); // 09:00
  const [end, setEnd] = useState(1020); // 17:00
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const s = space?.schedule;
    if (s) {
      setEnabled(s.enabled);
      setDays(s.days);
      setStart(s.startMin);
      setEnd(s.endMin);
    }
  }, [space?.schedule]);

  // Operator's UTC offset in minutes to add to UTC (JS getTimezoneOffset is
  // inverted): e.g. US Eastern → +? we store add-to-UTC = -getTimezoneOffset.
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  async function save() {
    if (!spaceId) return;
    setSaving(true);
    try {
      await setSchedule({
        spaceId,
        schedule: { enabled, days, startMin: start, endMin: end, tzOffsetMinutes },
      });
      toast("Schedule saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="h-4 w-4 text-accent" /> Active hours
          </h2>
          <p className="text-sm text-muted">
            Only let agents work during business hours. Outside the window,
            autonomous dispatch is refused (your local timezone).
          </p>
        </div>
        <Toggle checked={enabled} onChange={setEnabled} />
      </div>

      <div className={cn("space-y-4 transition", !enabled && "pointer-events-none opacity-50")}>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <button
              key={d}
              onClick={() => setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
              className={cn(
                "h-9 w-11 rounded-lg border text-xs transition",
                days.includes(i)
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-surface-2 text-muted hover:text-foreground",
              )}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted">From</label>
          <input
            type="time"
            value={toHHMM(start)}
            onChange={(e) => setStart(fromHHMM(e.target.value))}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          />
          <label className="text-sm text-muted">to</label>
          <input
            type="time"
            value={toHHMM(end)}
            onChange={(e) => setEnd(fromHHMM(e.target.value))}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          />
        </div>
      </div>

      {canAdmin && (
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save schedule"}
          </Button>
        </div>
      )}
    </Card>
  );
}
