'use strict';

/**
 * Benchmark: team-membership export serialization
 *
 * Tests Format A and Format B serialization against synthetic caches at three
 * workspace sizes to determine whether export needs SSE or can be a direct
 * HTTP response.
 *
 * Run: node test/team-membership.export.bench.js
 */

// ─── Synthetic data generators ───────────────────────────────────────────────

function makeUuid(n) {
  return `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

function buildSyntheticCache(memberCount, teamCount) {
  const membersById = new Map();
  const membersByEmail = new Map();
  const teamsById = new Map();
  const memberIdsByTeamId = new Map();

  for (let i = 0; i < memberCount; i++) {
    const id = makeUuid(i);
    const email = `member${i}@example.com`;
    const profile = { id, name: `Member ${i}`, email, role: 'maker' };
    membersById.set(id, profile);
    membersByEmail.set(email, profile);
  }

  const memberIds = [...membersById.keys()];

  for (let t = 0; t < teamCount; t++) {
    const id = makeUuid(1_000_000 + t);
    teamsById.set(id, { id, name: `Team ${t}`, handle: `team-${t}` });

    // Each team gets roughly half the members (staggered assignment)
    const members = new Set();
    for (let i = t % 2; i < memberCount; i += 2) {
      members.add(memberIds[i]);
    }
    memberIdsByTeamId.set(id, members);
  }

  return { membersById, membersByEmail, teamsById, memberIdsByTeamId };
}

// ─── Inline serializers (same logic planned for teamMembership.js) ────────────

function exportFormatA(cache, teamIds) {
  const { membersById, teamsById, memberIdsByTeamId } = cache;
  const teams = teamIds
    ? teamIds.map((id) => teamsById.get(id)).filter(Boolean)
    : [...teamsById.values()];
  teams.sort((a, b) => a.name.localeCompare(b.name));

  // header
  const teamHeaders = teams.map((t) => `"${t.name} [${t.id}]"`);
  const rows = [`email,name,role,${teamHeaders.join(',')}`];

  for (const member of membersById.values()) {
    const cells = teams.map((t) => {
      const set = memberIdsByTeamId.get(t.id);
      return set && set.has(member.id) ? '✓' : '';
    });
    rows.push(`${member.email},"${member.name}",${member.role},${cells.join(',')}`);
  }

  return rows.join('\n');
}

function exportFormatB(cache, teamIds) {
  const { membersById, teamsById, memberIdsByTeamId } = cache;
  const teams = teamIds
    ? teamIds.map((id) => teamsById.get(id)).filter(Boolean)
    : [...teamsById.values()];
  teams.sort((a, b) => a.name.localeCompare(b.name));

  const columns = teams.map((t) => {
    const memberSet = memberIdsByTeamId.get(t.id) || new Set();
    const emails = [...memberSet].map((id) => membersById.get(id)?.email).filter(Boolean);
    return { header: `"${t.name} [${t.id}]"`, emails };
  });

  const maxRows = Math.max(0, ...columns.map((c) => c.emails.length));
  const header = columns.map((c) => c.header).join(',');
  const rows = [header];

  for (let r = 0; r < maxRows; r++) {
    rows.push(columns.map((c) => c.emails[r] ?? '').join(','));
  }

  return rows.join('\n');
}

// ─── Benchmark runner ─────────────────────────────────────────────────────────

function bench(label, fn) {
  const start = performance.now();
  const result = fn();
  const elapsed = performance.now() - start;
  const bytes = Buffer.byteLength(result, 'utf8');
  console.log(
    `  ${label.padEnd(30)} ${elapsed.toFixed(1).padStart(7)} ms   ${(bytes / 1024).toFixed(0).padStart(6)} KB`
  );
  return elapsed;
}

const SIZES = [
  { members: 50,   teams: 10,  label: 'small  (50m / 10t)' },
  { members: 250,  teams: 50,  label: 'medium (250m / 50t)' },
  { members: 1000, teams: 100, label: 'large  (1000m / 100t)' },
  { members: 2500, teams: 200, label: 'xl     (2500m / 200t)' },
];

console.log('\nTeam Membership Export — Serialization Benchmark');
console.log('='.repeat(58));
console.log(`  ${'Scenario'.padEnd(30)} ${'Time'.padStart(8)}   ${'Size'.padStart(7)}`);
console.log('-'.repeat(58));

for (const { members, teams, label } of SIZES) {
  const cache = buildSyntheticCache(members, teams);
  bench(`Format A ${label}`, () => exportFormatA(cache));
  bench(`Format B ${label}`, () => exportFormatB(cache));
}

console.log('='.repeat(58));
console.log('\nConclusion: if all times are well under 200ms, direct HTTP download');
console.log('is appropriate (no SSE needed). SSE adds ~100ms overhead + frontend complexity.');
console.log('');
