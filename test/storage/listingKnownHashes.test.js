/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

let db;

vi.mock('../../lib/services/storage/SqliteConnection.js', () => ({
  default: {
    query: (sql, params = {}) => db.prepare(sql).all(params),
    execute: (sql, params = {}) => db.prepare(sql).run(params),
  },
}));

describe('known listing hashes', () => {
  let getKnownListingHashesForJobAndProvider;

  beforeEach(async () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
      CREATE TABLE listings (id TEXT PRIMARY KEY, job_id TEXT, provider TEXT, hash TEXT);
      INSERT INTO jobs VALUES ('wide', 'owner'), ('core', 'owner'), ('other', 'stranger');
      INSERT INTO listings VALUES
        ('a', 'wide', 'wgGesucht', 'shared-hash'),
        ('b', 'other', 'wgGesucht', 'private-hash'),
        ('c', 'wide', 'immowelt', 'other-provider');
    `);
    ({ getKnownListingHashesForJobAndProvider } = await import('../../lib/services/storage/listingsStorage.js'));
  });

  afterEach(() => db.close());

  it('deduplicates across jobs owned by the same user only', () => {
    expect(getKnownListingHashesForJobAndProvider('core', 'wgGesucht')).toEqual(['shared-hash']);
  });
});
