'use strict';

/** Extract a readable message from a PB API error response. */
function parseApiError(err) {
  if (err.status === 401) return 'Invalid or unauthorized token.';
  if (err.status === 403) return 'Token does not have permission to access this workspace.';
  const msg = err.message || String(err);
  const jsonMatch = msg.match(/\{[\s\S]*"errors"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const first = parsed.errors?.[0];
      if (first) return first.detail || first.title || msg;
    } catch (_) {}
  }
  return msg;
}

module.exports = { parseApiError };
