/**
 * ID cache for entity import.
 *
 * Maps ext_key → pb_id per entity type, built once per request.
 * - Seeded at preflight from all rows that have both ext_key + pb_id.
 * - Updated after each successful CREATE so relationship resolution works
 *   for entities created earlier in the same run.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createIdCache() {
  // store[entityType][extKey] = pbId
  const store = {};

  return {
    store,

    /**
     * Preflight seed: register every row where both ext_key and pb_id are set.
     * @param {{ [entityType]: object[] }} rowsByType  — normalized rows (_extKey, _pbId)
     */
    seed(rowsByType) {
      for (const [type, rows] of Object.entries(rowsByType)) {
        for (const row of rows) {
          const k = row._extKey;
          const v = row._pbId;
          if (k && v) {
            store[type] = store[type] || {};
            store[type][k] = v;
          }
        }
      }
    },

    /**
     * Register a newly created entity after a successful CREATE call.
     */
    set(type, extKey, pbId) {
      if (!extKey || !pbId) return;
      store[type] = store[type] || {};
      store[type][extKey] = pbId;
    },

    /**
     * Resolve a token (UUID or ext_key) to a pb_id for the given type.
     * UUID tokens are returned directly without a cache lookup.
     */
    resolve(type, token) {
      if (!token) return null;
      const clean = String(token).trim();
      if (!clean) return null;
      if (UUID_RE.test(clean)) return clean;
      return store[type]?.[clean] || null;
    },

    /**
     * Resolve the parent id for a normalized row.
     * Mirrors resolveParentIdFromRow_() + findParentForKey_() from mainLogicImporter.gs.
     *
     * Returns { id, type } or null.
     */
    resolveParent(row) {
      const type = row._type;

      if (type === 'component' || type === 'feature') {
        return _findParent(row, row['parent_ext_key'], ['component', 'product']);
      }

      if (type === 'subfeature') {
        const key = String(row['parent_feat_ext_key'] || '').trim();
        if (!key) return null;
        const id = this.resolve('feature', key);
        return id ? { id, type: 'feature' } : null;
      }

      if (type === 'objective') {
        const key = String(row['parent_obj_ext_key'] || '').trim();
        if (!key) return null;
        const id = this.resolve('objective', key);
        return id ? { id, type: 'objective' } : null;
      }

      if (type === 'keyResult') {
        const key = String(row['parent_obj_ext_key'] || '').trim();
        if (!key) return null;
        const id = this.resolve('objective', key);
        return id ? { id, type: 'objective' } : null;
      }

      if (type === 'release') {
        const key = String(row['parent_rlgr_ext_key'] || '').trim();
        if (!key) return null;
        const id = this.resolve('releaseGroup', key);
        return id ? { id, type: 'releaseGroup' } : null;
      }

      // product, initiative, releaseGroup — no inline parent
      return null;
    },
  };

  function _findParent(row, rawKey, candidateTypes) {
    const key = String(rawKey || '').trim();
    if (!key) return null;
    // Don't self-reference
    if (row._extKey && row._extKey === key) return null;
    for (const t of candidateTypes) {
      const id = UUID_RE.test(key) ? key : store[t]?.[key];
      if (id) return { id, type: t };
    }
    return null;
  }
}

module.exports = { createIdCache, UUID_RE };
