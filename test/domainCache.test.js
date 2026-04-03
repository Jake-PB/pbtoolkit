'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDomainToIdMap, buildIdToDomainMap } = require('../src/lib/domainCache');

// ── fixtures ─────────────────────────────────────────────────────────────────

const COMPANY_A = {
  id: 'comp-aaa',
  fields: { name: 'Acme', domain: 'acme.com' },
};
const COMPANY_B = {
  id: 'comp-bbb',
  fields: { name: 'Beta', domain: 'beta.io' },
};
const COMPANY_NO_DOMAIN = {
  id: 'comp-ccc',
  fields: { name: 'NoDomain' },
};

// ── buildDomainToIdMap ───────────────────────────────────────────────────────

test('buildDomainToIdMap — builds lowercase domain→id lookup', async () => {
  const fetchAllPages = async () => [COMPANY_A, COMPANY_B];

  const map = await buildDomainToIdMap(fetchAllPages);

  assert.equal(map['acme.com'], 'comp-aaa');
  assert.equal(map['beta.io'], 'comp-bbb');
});

test('buildDomainToIdMap — normalizes domain to lowercase', async () => {
  const fetchAllPages = async () => [{ id: 'comp-x', fields: { domain: 'UPPER.COM' } }];

  const map = await buildDomainToIdMap(fetchAllPages);

  assert.equal(map['upper.com'], 'comp-x');
  assert.equal(map['UPPER.COM'], undefined);
});

test('buildDomainToIdMap — skips companies without domain', async () => {
  const fetchAllPages = async () => [COMPANY_A, COMPANY_NO_DOMAIN];

  const map = await buildDomainToIdMap(fetchAllPages);

  assert.equal(map['acme.com'], 'comp-aaa');
  assert.equal(Object.keys(map).length, 1);
});

test('buildDomainToIdMap — returns empty map when no companies', async () => {
  const fetchAllPages = async () => [];

  const map = await buildDomainToIdMap(fetchAllPages);

  assert.deepEqual(map, {});
});

test('buildDomainToIdMap — passes label to fetchAllPages', async () => {
  let capturedLabel;
  const fetchAllPages = async (path, label) => { capturedLabel = label; return []; };

  await buildDomainToIdMap(fetchAllPages, 'my label');

  assert.equal(capturedLabel, 'my label');
});

// ── buildIdToDomainMap ───────────────────────────────────────────────────────

test('buildIdToDomainMap — builds id→{domain} lookup', async () => {
  const fetchAllPages = async () => [COMPANY_A, COMPANY_NO_DOMAIN];

  const map = await buildIdToDomainMap(fetchAllPages);

  assert.equal(map['comp-aaa'].domain, 'acme.com');
  assert.equal(map['comp-ccc'].domain, ''); // no domain → empty string
});

test('buildIdToDomainMap — includes every company regardless of domain', async () => {
  const fetchAllPages = async () => [COMPANY_A, COMPANY_B, COMPANY_NO_DOMAIN];

  const map = await buildIdToDomainMap(fetchAllPages);

  assert.equal(Object.keys(map).length, 3);
  assert.ok('comp-ccc' in map);
});

test('buildIdToDomainMap — returns empty map when no companies', async () => {
  const fetchAllPages = async () => [];

  const map = await buildIdToDomainMap(fetchAllPages);

  assert.deepEqual(map, {});
});
