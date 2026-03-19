'use strict';

/**
 * Unit tests for src/lib/csvUtils.js and src/lib/errorUtils.js.
 * Pure functions — no HTTP mocking needed.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { parseCSV, generateCSV, generateCSVFromColumns, cell } = require('../src/lib/csvUtils');
const { parseApiError } = require('../src/lib/errorUtils');

// ─── parseCSV ────────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  test('parses basic CSV into headers + rows', () => {
    const { headers, rows, errors } = parseCSV('Name,Domain\nAcme,acme.com\nBeta,beta.io');
    assert.deepEqual(headers, ['Name', 'Domain']);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Name, 'Acme');
    assert.equal(rows[1].Domain, 'beta.io');
    assert.equal(errors.length, 0);
  });

  test('trims header whitespace', () => {
    const { headers } = parseCSV(' Name , Domain \nAcme,acme.com');
    assert.deepEqual(headers, ['Name', 'Domain']);
  });

  test('skips empty lines', () => {
    const { rows } = parseCSV('Name,Domain\nAcme,acme.com\n\n\nBeta,beta.io\n');
    assert.equal(rows.length, 2);
  });

  test('handles quoted fields containing commas', () => {
    const { rows } = parseCSV('Name,Notes\nAcme,"Note with, comma"');
    assert.equal(rows[0].Notes, 'Note with, comma');
  });

  test('handles quoted fields containing newlines', () => {
    const csv = 'Name,Notes\nAcme,"line one\nline two"';
    const { rows } = parseCSV(csv);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].Notes.includes('line one'));
  });

  test('returns empty rows array for header-only CSV', () => {
    const { rows } = parseCSV('Name,Domain');
    assert.equal(rows.length, 0);
  });

  test('handles single-column CSV', () => {
    const { headers, rows } = parseCSV('Name\nAcme\nBeta');
    assert.deepEqual(headers, ['Name']);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Name, 'Acme');
  });

  test('strips BOM from first header', () => {
    const { headers } = parseCSV('\uFEFFName,Domain\nAcme,acme.com');
    assert.equal(headers[0], 'Name');
  });
});

// ─── cell ─────────────────────────────────────────────────────────────────────

describe('cell', () => {
  const row = { Name: 'Acme', Domain: 'acme.com', Empty: '', Spaces: '  hello  ' };

  test('returns trimmed string value', () => {
    assert.equal(cell(row, 'Name'), 'Acme');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(cell(row, 'Spaces'), 'hello');
  });

  test('returns empty string for empty cell', () => {
    assert.equal(cell(row, 'Empty'), '');
  });

  test('returns empty string for missing column', () => {
    assert.equal(cell(row, 'NonExistent'), '');
  });

  test('returns empty string when colName is null', () => {
    assert.equal(cell(row, null), '');
  });

  test('returns empty string when colName is undefined', () => {
    assert.equal(cell(row, undefined), '');
  });

  test('returns empty string when row is null', () => {
    assert.equal(cell(null, 'Name'), '');
  });

  test('coerces number values to string', () => {
    assert.equal(cell({ Count: 42 }, 'Count'), '42');
  });
});

// ─── generateCSV ─────────────────────────────────────────────────────────────

describe('generateCSV', () => {
  test('produces header row + data rows', () => {
    const rows    = [{ id: 'a1', name: 'Acme' }];
    const fields  = ['id', 'name'];
    const headers = ['PB ID', 'Company Name'];
    const csv = generateCSV(rows, fields, headers);
    // Strip BOM and trim CRLF before asserting — generateCSV prepends \uFEFF
    const firstLine = csv.replace(/^\uFEFF/, '').split('\n')[0].trim();
    assert.ok(firstLine.startsWith('PB ID,Company Name'), `unexpected header: ${firstLine}`);
    assert.ok(csv.includes('a1'), 'data row missing');
  });

  test('uses human-readable header labels', () => {
    const csv = generateCSV([{ k: 'v' }], ['k'], ['My Label']);
    assert.ok(csv.includes('My Label'));
    assert.ok(!csv.includes('"k"') && !csv.startsWith('k,'), 'should use label not key');
  });

  test('replaces null/undefined cell with empty string', () => {
    const csv = generateCSV([{ a: null, b: undefined, c: 'val' }], ['a', 'b', 'c'], ['A', 'B', 'C']);
    const dataLine = csv.split('\n')[1];
    assert.ok(dataLine.startsWith(',,'), `expected empty cells, got: ${dataLine}`);
  });
});

// ─── generateCSVFromColumns ───────────────────────────────────────────────────

describe('generateCSVFromColumns', () => {
  test('uses colDef key to read data and label for header', () => {
    const rows = [{ pb_id: 'uuid-1', company_name: 'Acme' }];
    const cols = [{ key: 'pb_id', label: 'PB ID' }, { key: 'company_name', label: 'Company Name' }];
    const csv = generateCSVFromColumns(rows, cols);
    assert.ok(csv.includes('PB ID'));
    assert.ok(csv.includes('Company Name'));
    assert.ok(csv.includes('uuid-1'));
    assert.ok(csv.includes('Acme'));
  });
});

// ─── parseApiError ────────────────────────────────────────────────────────────

describe('parseApiError', () => {
  test('returns plain error message when no JSON embedded', () => {
    const err = new Error('Something went wrong');
    assert.equal(parseApiError(err), 'Something went wrong');
  });

  test('extracts detail from embedded PB errors array', () => {
    const payload = JSON.stringify({ errors: [{ detail: 'Field is required', title: 'Validation error' }] });
    const err = new Error(`PB POST /v2/entities → 422: ${payload}`);
    assert.equal(parseApiError(err), 'Field is required');
  });

  test('falls back to title when detail is absent', () => {
    const payload = JSON.stringify({ errors: [{ title: 'Not found' }] });
    const err = new Error(`PB GET /v2/entities/x → 404: ${payload}`);
    assert.equal(parseApiError(err), 'Not found');
  });

  test('falls back to original message when JSON parse fails', () => {
    const err = new Error('Response: {"errors": [invalid json}');
    assert.equal(parseApiError(err), err.message);
  });

  test('handles non-Error objects with String(err)', () => {
    const result = parseApiError('raw string error');
    assert.equal(result, 'raw string error');
  });

  test('returns original message when errors array is empty', () => {
    const payload = JSON.stringify({ errors: [] });
    const err = new Error(`PB → 400: ${payload}`);
    assert.equal(parseApiError(err), err.message);
  });
});
