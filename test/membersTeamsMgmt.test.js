'use strict';

/**
 * Members & Teams Management route tests.
 *
 * Covers: GET /load, PATCH /team/:id, POST /team/:teamId/add-member,
 *         POST /team/:teamId/remove-member, POST /move-member,
 *         POST /team (create), DELETE /team/:id
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const request = require('supertest');

const TEAM_A  = 'team-aaaa-1111-2222-333333333333';
const TEAM_B  = 'team-bbbb-1111-2222-333333333333';
const MEMBER1 = 'mem-1111-1111-1111-111111111111';
const MEMBER2 = 'mem-2222-2222-2222-222222222222';

// ─── Mock PB API ─────────────────────────────────────────────────────────────

let mockServer, mockPort, app;
const calls = [];

function clearCalls() { calls.length = 0; }

before(async () => {
  process.env.NODE_ENV = 'test';
  mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });

      // GET /v2/teams/:id/members
      if (req.method === 'GET' && req.url === `/v2/teams/${TEAM_A}/members`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: MEMBER1, fields: { name: 'Alice', email: 'alice@co.com', role: 'admin' } },
          ],
          links: {},
        }));
        return;
      }

      // GET /v2/teams
      if (req.method === 'GET' && req.url.startsWith('/v2/teams')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: TEAM_A, fields: { name: 'Alpha', handle: 'alpha', description: 'Team A' },
              relationships: { members: { data: [{ id: MEMBER1 }] } } },
            { id: TEAM_B, fields: { name: 'Beta', handle: 'beta', description: '' },
              relationships: { members: { data: [{ id: MEMBER2 }] } } },
          ],
          links: {},
        }));
        return;
      }

      if (req.method === 'GET' && req.url === `/v2/teams/${TEAM_B}/members`) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: MEMBER2, fields: { name: 'Bob', email: 'bob@co.com', role: 'member' } },
          ],
          links: {},
        }));
        return;
      }

      // GET /v2/members
      if (req.method === 'GET' && req.url.startsWith('/v2/members')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: MEMBER1, fields: { name: 'Alice', email: 'alice@co.com', role: 'admin' } },
            { id: MEMBER2, fields: { name: 'Bob', email: 'bob@co.com', role: 'member' } },
          ],
          links: {},
        }));
        return;
      }

      // PATCH /v2/teams/:id (update or add/remove member)
      if (req.method === 'PATCH' && req.url.match(/\/v2\/teams\//)) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: { id: req.url.split('/').pop() } }));
        return;
      }

      // POST /v2/teams (create)
      if (req.method === 'POST' && req.url === '/v2/teams') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: { id: 'new-team-id' } }));
        return;
      }

      // DELETE /v2/teams/:id
      if (req.method === 'DELETE' && req.url.match(/\/v2\/teams\//)) {
        res.writeHead(204);
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
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
  delete process.env.NODE_ENV;
});

// ─── GET /load ───────────────────────────────────────────────────────────────

test('GET /api/members-teams-mgmt/load: returns 400 without token', async () => {
  const res = await request(app).get('/api/members-teams-mgmt/load');
  assert.equal(res.status, 400);
});

test('GET /api/members-teams-mgmt/load: returns teams with members', async () => {
  clearCalls();
  const res = await request(app)
    .get('/api/members-teams-mgmt/load?refresh=true')
    .set('x-pb-token', 'test-mtm');

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.teams));
  assert.ok(Array.isArray(res.body.allMembers));
  assert.ok(res.body.teams.length >= 2);
  assert.ok(res.body.allMembers.length >= 2);

  // Teams should have embedded members
  const alpha = res.body.teams.find((t) => t.name === 'Alpha');
  assert.ok(alpha);
  assert.ok(alpha.members.length >= 1);
  assert.ok(alpha.members[0].email);
});

// ─── PATCH /team/:id ─────────────────────────────────────────────────────────

test('PATCH /api/members-teams-mgmt/team/:id: updates team name', async () => {
  clearCalls();
  const res = await request(app)
    .patch(`/api/members-teams-mgmt/team/${TEAM_A}`)
    .set('x-pb-token', 'test-mtm')
    .send({ name: 'Alpha Renamed' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.includes(TEAM_A));
  assert.ok(patchCall);
  assert.equal(patchCall.body.data.fields.name, 'Alpha Renamed');
});

test('PATCH /api/members-teams-mgmt/team/:id: returns 400 when no fields', async () => {
  const res = await request(app)
    .patch(`/api/members-teams-mgmt/team/${TEAM_A}`)
    .set('x-pb-token', 'test-mtm')
    .send({});

  assert.equal(res.status, 400);
});

// ─── POST /team/:teamId/add-member ──────────────────────────────────────────

test('POST add-member: adds member to team', async () => {
  clearCalls();
  const res = await request(app)
    .post(`/api/members-teams-mgmt/team/${TEAM_A}/add-member`)
    .set('x-pb-token', 'test-mtm')
    .send({ memberId: MEMBER2 });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.includes(TEAM_A));
  assert.ok(patchCall);
  assert.equal(patchCall.body.data.patch[0].op, 'addItems');
  assert.equal(patchCall.body.data.patch[0].path, 'members');
});

test('POST add-member: returns 400 without memberId', async () => {
  const res = await request(app)
    .post(`/api/members-teams-mgmt/team/${TEAM_A}/add-member`)
    .set('x-pb-token', 'test-mtm')
    .send({});

  assert.equal(res.status, 400);
});

// ─── POST /team/:teamId/remove-member ───────────────────────────────────────

test('POST remove-member: removes member from team', async () => {
  clearCalls();
  const res = await request(app)
    .post(`/api/members-teams-mgmt/team/${TEAM_A}/remove-member`)
    .set('x-pb-token', 'test-mtm')
    .send({ memberId: MEMBER1 });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const patchCall = calls.find((c) => c.method === 'PATCH' && c.url.includes(TEAM_A));
  assert.ok(patchCall);
  assert.equal(patchCall.body.data.patch[0].op, 'removeItems');
});

test('POST remove-member: returns 400 without memberId', async () => {
  const res = await request(app)
    .post(`/api/members-teams-mgmt/team/${TEAM_A}/remove-member`)
    .set('x-pb-token', 'test-mtm')
    .send({});

  assert.equal(res.status, 400);
});

// ─── POST /move-member ──────────────────────────────────────────────────────

test('POST move-member: moves member between teams (add then remove)', async () => {
  clearCalls();
  const res = await request(app)
    .post('/api/members-teams-mgmt/move-member')
    .set('x-pb-token', 'test-mtm')
    .send({ memberId: MEMBER1, fromTeamId: TEAM_A, toTeamId: TEAM_B });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  // Should have issued two PATCHes: add to TEAM_B, remove from TEAM_A
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.ok(patches.length >= 2);

  const addCall = patches.find((c) => c.url.includes(TEAM_B));
  assert.ok(addCall);
  assert.equal(addCall.body.data.patch[0].op, 'addItems');

  const removeCall = patches.find((c) => c.url.includes(TEAM_A));
  assert.ok(removeCall);
  assert.equal(removeCall.body.data.patch[0].op, 'removeItems');
});

test('POST move-member: same team is no-op', async () => {
  clearCalls();
  const res = await request(app)
    .post('/api/members-teams-mgmt/move-member')
    .set('x-pb-token', 'test-mtm')
    .send({ memberId: MEMBER1, fromTeamId: TEAM_A, toTeamId: TEAM_A });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  // No PATCH calls should have been made for same-team move
  const patches = calls.filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 0);
});

test('POST move-member: returns 400 without required fields', async () => {
  const res = await request(app)
    .post('/api/members-teams-mgmt/move-member')
    .set('x-pb-token', 'test-mtm')
    .send({ memberId: MEMBER1 });

  assert.equal(res.status, 400);
});

// ─── POST /team (create) ────────────────────────────────────────────────────

test('POST create team: creates team with name', async () => {
  clearCalls();
  const res = await request(app)
    .post('/api/members-teams-mgmt/team')
    .set('x-pb-token', 'test-mtm')
    .send({ name: 'New Team', handle: 'newteam', description: 'A new team' });

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.id, 'new-team-id');

  const postCall = calls.find((c) => c.method === 'POST' && c.url === '/v2/teams');
  assert.ok(postCall);
  assert.equal(postCall.body.data.fields.name, 'New Team');
  assert.equal(postCall.body.data.fields.handle, 'newteam');
});

test('POST create team: returns 400 without name', async () => {
  const res = await request(app)
    .post('/api/members-teams-mgmt/team')
    .set('x-pb-token', 'test-mtm')
    .send({});

  assert.equal(res.status, 400);
});

test('POST create team: sanitizes handle to lowercase alphanumeric', async () => {
  clearCalls();
  const res = await request(app)
    .post('/api/members-teams-mgmt/team')
    .set('x-pb-token', 'test-mtm')
    .send({ name: 'Test', handle: 'My-Handle_123!' });

  assert.equal(res.status, 200);
  const postCall = calls.find((c) => c.method === 'POST' && c.url === '/v2/teams');
  assert.equal(postCall.body.data.fields.handle, 'myhandle123');
});

// ─── DELETE /team/:id ────────────────────────────────────────────────────────

test('DELETE team: deletes team by id', async () => {
  clearCalls();
  const res = await request(app)
    .delete(`/api/members-teams-mgmt/team/${TEAM_A}`)
    .set('x-pb-token', 'test-mtm');

  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);

  const deleteCall = calls.find((c) => c.method === 'DELETE');
  assert.ok(deleteCall);
  assert.ok(deleteCall.url.includes(TEAM_A));
});
