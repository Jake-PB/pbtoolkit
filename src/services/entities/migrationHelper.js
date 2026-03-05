/**
 * Entity migration helper — Phase 3
 *
 * Post-processing step applied to exported rows when migrationMode is enabled.
 * Rewrites UUID ext_keys to WORKSPACE-TYPE-NNN format and updates relationship columns
 * to use the new ext_keys instead of raw PB UUIDs.
 *
 * Works for both single-type and multi-type (export-all) use cases.
 *
 * Note: The pre-import "normalize-keys" transform lives in routes/entities.js directly
 * (POST /api/entities/normalize-keys) since it's a pure CSV transform needing no services.
 */

const { ENTITY_ORDER, TYPE_CODE } = require('./meta');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Relationship columns whose values are single UUIDs (parent links)
const PARENT_REL_COLS = [
  'parent_ext_key',
  'parent_feat_ext_key',
  'parent_obj_ext_key',
  'parent_rlgr_ext_key',
];

// Relationship columns whose values are comma-separated UUID lists (connected links)
const CONNECTED_REL_COLS = [
  'connected_rels_ext_key',
  'connected_objs_ext_key',
  'connected_inis_ext_key',
];

/**
 * Apply migration-mode post-processing to an entity rows map.
 *
 * Pass 1 — Assign new WORKSPACE-TYPE-NNN ext_keys to every entity and build
 *           a pb_id UUID → new_ext_key lookup map.
 * Pass 2 — Rewrite relationship columns: replace any UUID value that maps to a
 *           known new ext_key with that ext_key string.
 *
 * Entities are numbered in ENTITY_ORDER (objectives first, releases last). Counters
 * start at 1 per type and increment through all rows of that type in the run.
 *
 * @param {{ [entityType: string]: object[] }} rowsByType
 *   Map of entityType → rows as returned by exporter.exportEntityType().
 *   Rows are mutated in-place.
 * @param {string} workspaceCode
 *   Short workspace identifier (e.g. "ACME"). Uppercased + stripped of non-alphanumeric.
 * @returns {{ [entityType: string]: object[] }}
 *   Same rowsByType reference with ext_keys and relationship columns rewritten.
 */
function applyMigrationMode(rowsByType, workspaceCode) {
  const code = String(workspaceCode).toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ── Pass 1: assign new ext_keys ────────────────────────────────────────────

  // pb_id UUID → newly assigned ext_key string
  const uuidToNewKey = {};

  // Process types in dependency order for consistent numbering
  const typesInOrder = ENTITY_ORDER.filter((t) => rowsByType[t]);

  for (const entityType of typesInOrder) {
    const rows = rowsByType[entityType];
    const typeCode = TYPE_CODE[entityType];
    let counter = 1;

    for (const row of rows) {
      const pbId = String(row['pb_id'] || '').trim();
      const newKey = `${code}-${typeCode}-${counter}`;
      counter++;

      // Record the pb_id → new ext_key mapping for relationship rewriting
      if (pbId && UUID_RE.test(pbId)) {
        uuidToNewKey[pbId] = newKey;
      }

      // Assign new ext_key: replace UUID-format ext_keys (or empty ext_keys)
      const currentExtKey = String(row['ext_key'] || '').trim();
      if (!currentExtKey || UUID_RE.test(currentExtKey)) {
        row['ext_key'] = newKey;
      }
      // Non-UUID ext_keys (already user-defined) are left as-is
    }
  }

  // ── Pass 2: rewrite relationship columns ───────────────────────────────────

  for (const entityType of typesInOrder) {
    const rows = rowsByType[entityType];

    for (const row of rows) {
      // Single-UUID parent columns
      for (const col of PARENT_REL_COLS) {
        const val = String(row[col] || '').trim();
        if (val && UUID_RE.test(val) && uuidToNewKey[val]) {
          row[col] = uuidToNewKey[val];
        }
      }

      // Comma-separated UUID connected-link columns
      for (const col of CONNECTED_REL_COLS) {
        const val = String(row[col] || '').trim();
        if (val) {
          const parts = val.split(',').map((s) => s.trim()).filter(Boolean);
          const rewritten = parts.map((v) =>
            UUID_RE.test(v) && uuidToNewKey[v] ? uuidToNewKey[v] : v
          );
          row[col] = rewritten.join(', ');
        }
      }
    }
  }

  return rowsByType;
}

module.exports = { applyMigrationMode };
