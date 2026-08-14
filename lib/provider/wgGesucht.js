/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { isOneOf, buildHash } from '../utils.js';
import checkIfListingIsActive from '../services/listings/listingActiveTester.js';
import { extractNumber } from '../utils/extract-number.js';
import puppeteerExtractor from '../services/extractor/puppeteerExtractor.js';
import * as cheerio from 'cheerio';
import logger from '../services/logger.js';
/** @import { ParsedListing } from '../types/listing.js' */
/** @import { ProviderConfig } from '../types/providerConfig.js' */

async function fetchDetails(listing, browser) {
  try {
    const html = await puppeteerExtractor(listing.link, null, { browser, name: 'wgGesucht_details' });
    if (!html) return listing;

    const details = extractDetails(html);

    return {
      ...listing,
      address: details.address || listing.address,
      description: details.description || listing.description,
      advertiser: details.advertiser || listing.advertiser,
      advertiserType: details.advertiserType || listing.advertiserType,
    };
  } catch (error) {
    logger.warn(`Could not fetch wgGesucht detail page for listing '${listing.id}'.`, error?.message || error);
    return listing;
  }
}

/**
 * Extract the fields that matter to filtering from a WG-Gesucht detail page.
 * WG-Gesucht splits descriptions across several tabs and keeps the account type in the contact
 * box, outside the description. Ignoring those nodes made commercial advertisers effectively
 * invisible to a job's blacklist.
 *
 * @param {string} html
 * @returns {{description: string, address: string, advertiser: string, advertiserType: string}}
 */
function extractDetails(html) {
  const $ = cheerio.load(html);
  $('[id^="freitext_"] script').remove();

  const description = $('[id^="freitext_"]')
    .toArray()
    .map((element) => $(element).text().replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');
  const address = $('a[href="#map_container"] .section_panel_detail').text().replace(/\s+/g, ' ').trim();
  const profile = $('.rhs_contact_information .user_profile_info').first();
  const advertiser = [profile.find('img[alt]').attr('alt'), profile.text()]
    .filter((value) => value && value !== 'public name')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const advertiserType = $('.contact_box_sticky .col-md-4').first().text().replace(/\s+/g, ' ').trim();

  return { description, address, advertiser, advertiserType };
}
/**
 * @param {any} o
 * @returns {ParsedListing}
 */
function normalize(o) {
  const id = buildHash(o.id, o.price);
  const link = `https://www.wg-gesucht.de${o.link}`;
  const image = o.image != null ? o.image.replace('small', 'large') : null;
  const [rooms, city, road] = o.details?.split(' | ') || [];
  const address = [city, road].filter(Boolean).join(', ') || null;
  return {
    id,
    link,
    title: o.title || '',
    price: extractNumber(o.price),
    size: extractNumber(o.size),
    rooms: extractNumber(rooms),
    address,
    image,
    description: o.description,
    advertiser: o.advertiser,
    advertiserType: o.advertiserType,
  };
}

/**
 * @param {ParsedListing} o
 * @param {string[]} appliedBlackList Terms the job wants filtered out.
 * @returns {boolean}
 */
function applyBlacklist(o, appliedBlackList) {
  return (
    o.id != null &&
    !isOneOf(o.title, appliedBlackList) &&
    !isOneOf(o.description, appliedBlackList) &&
    !isOneOf(o.advertiser, appliedBlackList) &&
    !isOneOf(o.advertiserType, appliedBlackList)
  );
}

/** @type {ProviderConfig} */
const config = {
  url: null,
  crawlContainer: '#main_column .wgg_card',
  sortByDateParam: 'sort_column=0&sort_order=0',
  waitForSelector: 'body',
  crawlFields: {
    id: '@data-id',
    details: '.row .noprint .col-xs-11 |removeNewline |trim',
    price: '.middle .col-xs-3 |removeNewline |trim',
    size: '.middle .text-right |removeNewline |trim',
    rooms: '.middle .text-right |removeNewline |trim',
    title: '.truncate_title a |removeNewline |trim',
    link: '.truncate_title a@href',
    image: '.img-responsive@src',
    description: '.row .noprint .col-xs-11 |removeNewline |trim',
    advertiser: '.row.noprint.bottom .col-xs-9 .ml5 |removeNewline |trim',
    advertiserType: '.label_verified |removeNewline |trim',
  },
  requiredFieldNames: ['id', 'link', 'title', 'price', 'size', 'rooms', 'address', 'image', 'description'],
  normalize: normalize,
  fetchDetails,
  activityProbe: checkIfListingIsActive,
  priceTracking: {
    /**
     * The "Kosten" panel lists Miete, Nebenkosten, Sonstige Kosten and Kaution, several of which are
     * routinely "n.a." or "0€". Only the first euro figure is the rent the search list shows, so the
     * scan stops at the first positive one rather than taking, say, the deposit.
     *
     * @param {string} html
     * @returns {string|null}
     */
    extract: (html) => {
      const $ = cheerio.load(html);
      for (const element of $('.section_panel_value').toArray()) {
        const text = $(element).text().trim();
        if (!/€/.test(text)) continue;
        const value = extractNumber(text);
        if (value != null && value > 0) return text;
      }
      return null;
    },
  },
};
/**
 * Build a run-scoped provider configuration.
 *
 * Returns a fresh object on every call instead of mutating module-level state. Two jobs can be in
 * flight at once - a manual run started while the scheduler is working through the others - and a
 * shared mutable config meant the second job overwrote the first job's URL and blacklist mid-run,
 * so listings were fetched for one job and stored under another.
 *
 * @param {{url: string, enabled?: boolean}} sourceConfig The job's entry for this provider.
 * @param {string[]} [blacklist] Terms to filter listings out by.
 * @returns {ProviderConfig} A configuration usable by a single pipeline run.
 */
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});
export const metaInformation = {
  name: 'Wg gesucht',
  baseUrl: 'https://www.wg-gesucht.de/',
  id: 'wgGesucht',
};
export { config, extractDetails };
