# PBToolkit Manual Testing Guide
_Generated: 2026-03-15_

## How to use
Run automated tests first, then work through each section below.

```bash
node --test test/**/*.test.js   # must be all-green before manual testing
```

Tick each box as you verify it. Re-run after any significant change.

---

## 1. Auth & Token Validation

- [ ] Load the app with no token set → token connect form is shown
- [ ] Enter an invalid token and click Connect → clear error message shown, no tools unlock
- [ ] Enter a valid token → success banner, tools become accessible
- [ ] Click Disconnect → token cleared, all module state resets, connect form shown again

---

## 2. Companies — Export

- [ ] Click Export with a valid token → progress bar appears, SSE log shows activity
- [ ] Export completes → "Exported N companies. Download started." with locale-formatted N
- [ ] Downloaded CSV has columns: PB Company ID, Company Name, Domain, Description, Source Origin, Source Record ID, plus any custom fields with `[type] [uuid]` headers
- [ ] Re-download button appears after export and triggers same file again
- [ ] Export with no companies in workspace → graceful "No companies found" message

---

## 3. Companies — Import

- [ ] Upload a valid CSV → field mapping table populates with base + custom field rows
- [ ] Close tab and re-open → mapping dropdowns restore to previous selections (localStorage)
- [ ] Auto-detect picks up `pb_id`, `name`, `domain` columns by common names (case-insensitive)
- [ ] Preview with no `pb_id` and no `domain` column mapped → validation error per row
- [ ] Preview with duplicate domain values (no UUID column) → validation error flagged
- [ ] Import with `pb_id` column → PATCH existing companies, not CREATE
- [ ] Import with `domain` column only → looks up company by domain, PATCHes if found, CREATEs if not
- [ ] Import with `clearEmptyFields` checked → empty cells clear existing values (not skip)
- [ ] Stop button during import → halts after current row, shows partial count
- [ ] Completion message shows locale-formatted count: "Exported N companies. Download started."

---

## 4. Companies — Delete

- [ ] Delete by CSV: upload CSV with `pb_id` column → correct companies deleted
- [ ] Delete by CSV: UUIDs not found (404) → shown as "skipped", not errors
- [ ] Delete All: confirmation prompt shown before running
- [ ] Delete All: SSE log shows progress every 50 records

---

## 5. Notes — Export

- [ ] Export notes → CSV downloads with all standard + source columns
- [ ] Source Origin / Source Record ID columns populated from v1+v2 merged data
- [ ] Filename format: `notes-export-YYYY-MM-DD.csv`

---

## 6. Notes — Import

- [ ] Upload CSV and map columns → preview shows row count
- [ ] Import: CREATE rows (no pb_id) → new notes created
- [ ] Import: UPDATE rows (pb_id present) → existing notes patched; empty mapped fields skipped (no empty PATCH sent)
- [ ] Import: abort mid-run → v2 backfill does NOT run for the aborted row
- [ ] Error rows appear in live log in red; successful rows in green

---

## 7. Notes — Delete

- [ ] Delete by CSV: notes with matching UUIDs are deleted
- [ ] Delete All: all notes in workspace removed

---

## 8. Entities — Export

- [ ] Select a single entity type → single CSV downloaded
- [ ] Completion message uses human label: "Exported N Features. Download started." (not "entities")
- [ ] Select multiple types → ZIP file downloaded containing one CSV per type
- [ ] Multi-type completion: "Exported N entities across all selected types. Download started."
- [ ] Filename format: `feature-export-YYYY-MM-DD-HHmm.csv` (note dash-separated date)
- [ ] Objectives export: CSV has `team` column (singular), not `teams`
- [ ] Re-download button appears after export

---

## 9. Entities — Import

- [ ] Upload CSV files per entity type → tiles show row count and file name
- [ ] Mapping state persists per entity type across page reloads
- [ ] Validation: duplicate `ext_key` → error shown before import starts
- [ ] Validation: CREATE row missing `Name` → error shown
- [ ] Validation: release CREATE missing `parent_rlgr_ext_key` → error shown
- [ ] Validation: malformed date in `timeframe_start` → error shown
- [ ] Import runs with SSE log; abort stops cleanly
- [ ] Relationship columns (parent, connections) written in second pass after all entities created

---

## 10. Member Activity — Export

- [ ] Connect token → metadata loads (roles, teams) without manual refresh
- [ ] Select date range, roles, teams → export runs
- [ ] Completion message: "Exported N rows. Download started."
- [ ] Filter by Active/Inactive → output contains only matching users
- [ ] Export with many teams selected → filename does not exceed ~204 characters total
- [ ] Raw mode toggle → additional raw-data columns in CSV

---

## 11. Filename conventions (spot-check across modules)

| Module | Expected pattern |
|---|---|
| Companies export | `companies-2026-03-15.csv` |
| Notes export | `notes-export-2026-03-01-to-2026-03-14.csv` |
| Entities single | `feature-export-2026-03-15-1430.csv` |
| Entities multi | `pbtoolkit-entities-export-2026-03-15-1430.zip` |
| Member Activity | `pb-member-activity_2026-03-01_2026-03-14.csv` |

---

## 12. Error & Edge Cases

- [ ] Upload empty CSV → validation message shown (not blank error or crash)
- [ ] Upload CSV with only a header row → "0 rows" shown cleanly
- [ ] Token expires mid-import → 401 error surfaced in live log, import halts
- [ ] Network disconnect mid-export → SSE connection closes, error shown in UI
- [ ] Very large CSV (10 000+ rows) → progress bar advances smoothly, no UI freeze

---

## 13. Security (spot-check)

- [ ] Open browser DevTools → no token visible in URL params or response bodies
- [ ] Inspect response headers → `Content-Security-Policy` and other Helmet headers present
- [ ] Paste `<script>alert(1)</script>` as a company name in a CSV → rendered as escaped text in the log, not executed

---

## 14. UI Consistency

- [ ] Progress bar styling is consistent across Companies / Notes / Entities / Member Activity
- [ ] Live log colour coding consistent: green = success, red = error, yellow = warn, grey = info
- [ ] Back-to-tools button present on every module view
- [ ] Resize browser to narrow width → no horizontal overflow or broken layout

---

_Add new sections here as new modules are shipped._
