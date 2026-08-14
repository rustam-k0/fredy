/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConfig, extractDetails } from '../../lib/provider/wgGesucht.js';

describe('WG-Gesucht blacklist fields', () => {
  it('filters a commercial listing by advertiser name from the search card', () => {
    const runConfig = createConfig({ url: 'https://www.wg-gesucht.de', enabled: true }, ['HousingAnywhere']);
    const listing = runConfig.normalize({
      id: '123',
      price: '900 €',
      link: '/listing.123.html',
      title: 'Modern room',
      description: 'Düsseldorf',
      advertiser: 'HousingAnywhere',
      advertiserType: 'Verifiziertes Unternehmen',
    });

    expect(runConfig.filter(listing)).toBe(false);
  });

  it('extracts every description tab and the account type from details', () => {
    const html = readFileSync(new URL('../testFixtures/wgGesucht_detail.html', import.meta.url), 'utf8');
    const details = extractDetails(html);

    expect(details.description).toContain('Das Zimmer ist ziemlich groß');
    expect(details.description).toContain('Die Wohnung liegt zwischen pempelfort und Derendorf');
    expect(details.description).toContain('Ich bin 22');
    expect(details.advertiserType).toContain('Private:r Nutzer:in');
  });

  it('filters the Spacest advertiser exposed on a detail page', () => {
    const runConfig = createConfig({ url: 'https://www.wg-gesucht.de', enabled: true }, ['Spacest']);
    const details = extractDetails(`
      <div class="rhs_contact_information">
        <div class="user_profile_info">
          <img alt="Profilbild">
          <p class="text-bold">Spacest.com</p>
        </div>
      </div>
    `);
    const listing = runConfig.normalize({
      id: '13597847',
      price: '690 €',
      link: '/wg-zimmer-in-Berlin.13597847.html',
      title: 'Zimmer - Zimmer in der Nazarethkirchstraße 51 (Aufgang A)',
      description: '2er WG | Berlin | Nazarethkirchstraße 51',
      advertiser: details.advertiser,
    });

    expect(details.advertiser).toContain('Spacest.com');
    expect(runConfig.filter(listing)).toBe(false);
  });
});
