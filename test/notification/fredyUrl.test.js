/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, expect, it } from 'vitest';
import { buildFredyListingUrl } from '../../lib/notification/fredyUrl.js';

describe('buildFredyListingUrl', () => {
  it('builds a listing route from a regular base URL', () => {
    expect(buildFredyListingUrl('https://fredy.example', 'abc')).toBe('https://fredy.example/#/listings/listing/abc');
  });

  it('repairs copied hash routes and keeps a reverse-proxy subpath', () => {
    expect(buildFredyListingUrl('https://example.test/fredy/#/dashboard', 'a/b')).toBe(
      'https://example.test/fredy/#/listings/listing/a%2Fb',
    );
  });

  it('adds http when the configured host has no scheme', () => {
    expect(buildFredyListingUrl('192.168.1.10:9998/', 'abc')).toBe('http://192.168.1.10:9998/#/listings/listing/abc');
  });
});
