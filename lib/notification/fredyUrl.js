/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

/**
 * Build a link to a listing in Fredy's hash router.
 * Accepts the common admin-input variants: a host without a scheme, a trailing slash, or a URL
 * copied from an already-open Fredy page (and therefore containing an old hash route).
 *
 * @param {string} baseUrl
 * @param {string} listingId
 * @returns {string|null}
 */
export function buildFredyListingUrl(baseUrl, listingId) {
  if (!baseUrl || !listingId) return null;

  let candidate = String(baseUrl).trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;

  try {
    const url = new URL(candidate);
    url.search = '';
    url.hash = `/listings/listing/${encodeURIComponent(String(listingId))}`;
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    return url.toString();
  } catch {
    return null;
  }
}
