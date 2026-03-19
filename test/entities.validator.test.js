'use strict';

/**
 * Unit tests for src/services/entities/validator.js.
 * Pure function — no HTTP mocking needed.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { validateEntityRows } = require('../src/services/entities/validator');

// Helpers
const noMapping = { columns: {} };

function makeRow(overrides) {
  return { Name: 'My Feature', ...overrides };
}

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('validateEntityRows — valid rows', () => {
  test('returns no errors for a clean CREATE row', () => {
    const rows = [makeRow({})];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 0);
  });

  test('returns no errors for a PATCH row (has valid pb_id)', () => {
    const rows = [{ pb_id: 'aabbccdd-0000-0000-0000-000000000001', Name: '' }];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 0);
  });

  test('returns no errors for a release CREATE with parent_rlgr_ext_key', () => {
    const rows = [makeRow({ parent_rlgr_ext_key: 'Q1-2026' })];
    const { errors } = validateEntityRows('release', rows, noMapping);
    assert.equal(errors.length, 0);
  });
});

// ─── Name required on CREATE ─────────────────────────────────────────────────

describe('validateEntityRows — name required on CREATE', () => {
  test('errors when CREATE row has no name', () => {
    const rows = [{ Name: '' }];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('Name is required'));
  });

  test('uses mapped name column when provided', () => {
    const rows = [{ 'Feature Name': '' }];
    const mapping = { columns: { name: 'Feature Name' } };
    const { errors } = validateEntityRows('feature', rows, mapping);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'Feature Name');
  });

  test('row number is 1-indexed (first data row = row 2)', () => {
    const rows = [{ Name: '' }];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors[0].row, 2);
  });

  test('does NOT error when PATCH row has no name (pb_id present)', () => {
    const rows = [{ pb_id: 'aabbccdd-0000-0000-0000-000000000001' }];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 0);
  });
});

// ─── Release parent required ─────────────────────────────────────────────────

describe('validateEntityRows — release requires parent_rlgr_ext_key on CREATE', () => {
  test('errors when release CREATE has no parent_rlgr_ext_key', () => {
    const rows = [makeRow({})];
    const { errors } = validateEntityRows('release', rows, noMapping);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('parent_rlgr_ext_key is required'));
  });

  test('no release-parent error for non-release entity type', () => {
    const rows = [makeRow({})];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    const releaseErrors = errors.filter((e) => e.message.includes('parent_rlgr_ext_key'));
    assert.equal(releaseErrors.length, 0);
  });

  test('no release-parent error on release PATCH row', () => {
    const rows = [{ pb_id: 'aabbccdd-0000-0000-0000-000000000001' }];
    const { errors } = validateEntityRows('release', rows, noMapping);
    assert.equal(errors.length, 0);
  });
});

// ─── Duplicate ext_key ────────────────────────────────────────────────────────

describe('validateEntityRows — duplicate ext_key', () => {
  test('errors on second row with the same ext_key', () => {
    const rows = [
      makeRow({ ext_key: 'FEAT-1' }),
      makeRow({ ext_key: 'FEAT-1' }),
    ];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    const dupErrors = errors.filter((e) => e.message.includes('Duplicate ext_key'));
    assert.equal(dupErrors.length, 1);
    assert.equal(dupErrors[0].row, 3); // second data row = row 3
  });

  test('no error when ext_key values are distinct', () => {
    const rows = [
      makeRow({ ext_key: 'FEAT-1' }),
      makeRow({ ext_key: 'FEAT-2' }),
    ];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.filter((e) => e.message.includes('Duplicate')).length, 0);
  });

  test('no error when ext_key is absent on all rows', () => {
    const rows = [makeRow({}), makeRow({})];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.filter((e) => e.message.includes('Duplicate')).length, 0);
  });
});

// ─── Timeframe date format ────────────────────────────────────────────────────

describe('validateEntityRows — timeframe date format', () => {
  test('errors when timeframe_start is not YYYY-MM-DD', () => {
    const rows = [makeRow({ 'timeframe_start (YYYY-MM-DD)': '15/03/2026' })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('timeframe_start must be YYYY-MM-DD'));
  });

  test('errors when timeframe_end is not YYYY-MM-DD', () => {
    const rows = [makeRow({ 'timeframe_end (YYYY-MM-DD)': 'March 2026' })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('timeframe_end must be YYYY-MM-DD'));
  });

  test('no error when timeframe fields are valid YYYY-MM-DD', () => {
    const rows = [makeRow({
      'timeframe_start (YYYY-MM-DD)': '2026-01-01',
      'timeframe_end (YYYY-MM-DD)':   '2026-03-31',
    })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.filter((e) => e.message.includes('timeframe')).length, 0);
  });

  test('no error when timeframe fields are empty', () => {
    const rows = [makeRow({ 'timeframe_start (YYYY-MM-DD)': '', 'timeframe_end (YYYY-MM-DD)': '' })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 0);
  });

  test('uses mapped timeframe column names', () => {
    const mapping = { columns: { timeframe_start: 'Start Date' } };
    const rows = [makeRow({ 'Start Date': '03-15-2026' })];
    const { errors } = validateEntityRows('feature', rows, mapping);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'Start Date');
  });
});

// ─── health_updated_by email format ──────────────────────────────────────────

describe('validateEntityRows — health_updated_by email format', () => {
  test('errors when health_updated_by is not a valid email', () => {
    const rows = [makeRow({ 'health_updated_by (email)': 'not-an-email' })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].message.includes('valid email'));
  });

  test('no error when health_updated_by is a valid email', () => {
    const rows = [makeRow({ 'health_updated_by (email)': 'user@example.com' })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.filter((e) => e.message.includes('email')).length, 0);
  });

  test('no error when health_updated_by is empty', () => {
    const rows = [makeRow({ 'health_updated_by (email)': '' })];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 0);
  });
});

// ─── Multiple errors on same row ─────────────────────────────────────────────

describe('validateEntityRows — multiple errors collected', () => {
  test('reports all errors across multiple rows', () => {
    const rows = [
      { Name: '' },                                          // missing name
      { Name: 'OK', 'timeframe_start (YYYY-MM-DD)': 'bad' }, // bad date
    ];
    const { errors } = validateEntityRows('feature', rows, noMapping);
    assert.equal(errors.length, 2);
    assert.equal(errors[0].row, 2);
    assert.equal(errors[1].row, 3);
  });

  test('empty rows array returns no errors', () => {
    const { errors, warnings } = validateEntityRows('feature', [], noMapping);
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 0);
  });
});
