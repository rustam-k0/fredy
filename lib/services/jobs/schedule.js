/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Return the next wall-clock boundary for an interval measured from midnight/epoch.
 * A 60-minute interval therefore always resolves to the next HH:00 rather than
 * one hour after the application happened to start or the previous scan finished.
 *
 * @param {number|string} intervalMinutes
 * @param {number} [now]
 * @returns {number} epoch milliseconds, or 0 for an invalid interval
 */
export function nextClockBoundary(intervalMinutes, now = Date.now()) {
  const minutes = Number(intervalMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  const periodMs = minutes * 60_000;
  const remainder = now % periodMs;
  return now + (remainder === 0 ? periodMs : periodMs - remainder);
}
