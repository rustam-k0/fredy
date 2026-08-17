/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { nextClockBoundary } from '../../../lib/services/jobs/schedule.js';

describe('job schedule clock boundaries', () => {
  it('aligns a 60-minute interval to the beginning of the next hour', () => {
    const at2238 = new Date('2026-08-17T22:38:00+02:00').getTime();
    expect(new Date(nextClockBoundary(60, at2238)).toISOString()).toBe('2026-08-17T21:00:00.000Z');
  });

  it('moves to the following hour when called exactly on a boundary', () => {
    const at2300 = new Date('2026-08-17T23:00:00+02:00').getTime();
    expect(new Date(nextClockBoundary(60, at2300)).toISOString()).toBe('2026-08-17T22:00:00.000Z');
  });

  it('rejects an invalid interval', () => {
    expect(nextClockBoundary(0, Date.now())).toBe(0);
  });
});
