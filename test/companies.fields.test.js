'use strict';

/**
 * Companies fields tests — Phase 1 (v2).
 *
 * Asserts GET /api/fields uses GET /v2/entities/configurations/company (single call)
 * instead of the old paginated GET /companies/custom-fields loop.
 *
 * - Only UUID-keyed fields are returned (non-UUID system fields like name/domain excluded)
 * - NumberFieldValue → type:'number', everything else → type:'text'
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const request = require('supertest');

const FIELD_UUID_1 = '11111111-1111-1111-1111-111111111111';
const FIELD_UUID_2 = '22222222-2222-2222-2222-222222222222';

// ─── Mock PB API server ──────────────────────────────────────────────────────

let mockServer;
let mockPort;
const calls = { get: [] };

function clearCalls() { calls.get = []; }

// Mock response for GET /v2/entities/configurations/company
// .data is a single object (not an array) — singular entity type endpoint
const mockV2Config = {
  data: {
    type: 'company',
    fields: {
      // Non-UUID system fields — excluded by STANDARD_FIELD_IDS in parseCompanyConfig
      name:        { id: 'name',        name: 'Name',        schema: 'TextFieldValue'    },
      description: { id: 'description', name: 'Description', schema: 'RichTextFieldValue' },
      // UUID custom fields — should be included
      [FIELD_UUID_1]: { id: FIELD_UUID_1, name: 'MRR',  schema: 'NumberFieldValue' },
      [FIELD_UUID_2]: { id: FIELD_UUID_2, name: 'Tier', schema: 'TextFieldValue'   },
    },
  },
};

let app;

before(async () => {
  mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.get.push(req.url);

      if (req.method === 'GET' && req.url.startsWith('/v2/entities/configurations/company')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockV2Config));
        return;
      }

      res.writeHead(204); res.end();
    });
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  mockPort = mockServer.address().port;
  process.env.PB_API_BASE_URL = `http://127.0.0.1:${mockPort}`;
  app = require('../src/server.js');
});

after(async () => {
  await new Promise((resolve) => mockServer.close(resolve));
  delete process.env.PB_API_BASE_URL;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

test('GET /api/fields: no token → 400', async () => {
  const res = await request(app).get('/api/fields');
  assert.equal(res.status, 400);
});

test('GET /api/fields: uses v2 config endpoint (not v1 /companies/custom-fields)', async () => {
  clearCalls();

  const res = await request(app)
    .get('/api/fields')
    .set('x-pb-token', 'test-token');

  assert.equal(res.status, 200);

  // v2 endpoint called
  assert.ok(
    calls.get.some((p) => p.startsWith('/v2/entities/configurations/company')),
    'Should have called GET /v2/entities/configurations/company'
  );
  // v1 endpoint NOT called
  assert.ok(
    !calls.get.some((p) => p.startsWith('/companies/custom-fields')),
    'Should NOT have called GET /companies/custom-fields'
  );
});

test('GET /api/fields: returns UUID fields with correct type mapping', async () => {
  clearCalls();

  const res = await request(app)
    .get('/api/fields')
    .set('x-pb-token', 'test-token');

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.fields));

  // Only the 2 UUID fields returned — not name/domain/description
  assert.equal(res.body.fields.length, 2, `Expected 2 UUID fields, got: ${JSON.stringify(res.body.fields)}`);

  const mrr  = res.body.fields.find((f) => f.id === FIELD_UUID_1);
  const tier = res.body.fields.find((f) => f.id === FIELD_UUID_2);

  assert.ok(mrr,  'MRR field not found');
  assert.ok(tier, 'Tier field not found');

  assert.equal(mrr.name,  'MRR');
  assert.equal(mrr.type,  'number'); // NumberFieldValue → number
  assert.equal(tier.name, 'Tier');
  assert.equal(tier.type, 'text');   // TextFieldValue → text
});
