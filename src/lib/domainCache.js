/**
 * Shared company domain cache utilities.
 *
 * Fetches all companies from the v2 list endpoint (cursor-paginated, covers
 * both legacy v1-created and v2-created companies). Domain is returned under
 * the standard 'domain' key in list responses — the workspace-specific UUID
 * key quirk was fixed by Productboard (confirmed 2026-04-03).
 */

/**
 * Build a domain → companyId lookup.
 * Used by import flows to resolve domain strings to company UUIDs.
 */
async function buildDomainToIdMap(fetchAllPages, label) {
  const companies = await fetchAllPages('/v2/entities?type[]=company', label || 'fetch companies for domain cache');
  const map = {};
  for (const entity of companies) {
    const domain = entity.fields?.domain;
    if (domain && typeof domain === 'string') map[domain.toLowerCase()] = entity.id;
  }
  return map;
}

/**
 * Build a companyId → { domain } lookup.
 * Used by user export to resolve parent company IDs to domain strings.
 */
async function buildIdToDomainMap(fetchAllPages, label) {
  const companies = await fetchAllPages('/v2/entities?type[]=company', label || 'fetch companies for domain cache');
  const map = {};
  for (const entity of companies) {
    map[entity.id] = { domain: entity.fields?.domain || '' };
  }
  return map;
}

module.exports = { buildDomainToIdMap, buildIdToDomainMap };
