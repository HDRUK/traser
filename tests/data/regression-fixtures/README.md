# TRASER regression fixtures

Golden request/response pairs captured from **production TRASER**
(`https://translate.healthdatagateway.org`) before the GAT-9016 Express →
React Router v7 rewrite lands. They are the parity baseline: the rewrite must
reproduce them, and where it deliberately does not, the divergence must appear
in the exclusion list below.

The replay harness that asserts against these files is WS1 PR05. This
directory and `scripts/harvest-regression-fixtures.mjs` are all PR01 ships.

**Size:** 6 datasets, 104 recorded calls, ~900 KB. This is deliberately small.
Parity drift is per-code-path, not per-dataset — fifty datasets sharing an
input schema exercise one code path fifty times. Six datasets are the minimum
that still span all four input-schema buckets production actually holds
(see "What the sample is").

## Layout

Model and version live in the **directory path**; the filename is only the
dataset and which form of it was used.

```
index.json                                       provenance, exact argv, per-case hashes, counts
inputs/{pid}__{form}.json                        the metadata object for one dataset

cases/find/{pid}__{form}.json                    POST /find
cases/find/with-errors/{pid}__{form}.json        POST /find?with_errors=1
cases/translate/{Schema}/{Version}/{pid}__{form}.json
cases/translate/{Schema}/{Version}/{variant}/{pid}__{form}.json
cases/validate/{Schema}/{Version}/{pid}__{form}.json
cases/validate/{Schema}/{Version}/subsection-summary/{pid}__{form}.json

cases/common/{call}.json                         dataset-independent calls
cases/common/{endpoint}/{Schema}/{Version}.json  ... parameterised by schema
cases/common/err/{call}.json                     request-shape failures
```

Translate variants are `no-validate`, `subsection-summary`, `with-extra` and
`no-select-first-matching`.

`form` is which form of the dataset the input came from:

| form | Gateway path | What it is |
|---|---|---|
| `canonical` | `latest_metadata.metadata.metadata` | The GWDM form, what `extractMetadata()` reads for an ACTIVE record. Uniformly GWDM 2.0 across production today. |
| `original` | `latest_metadata.metadata.original_metadata` | The user-supplied form. This is where the input-schema variety lives — HDRUK of several versions, plus records that match no schema at all. |

Harvesting only `canonical` would have produced a sample that was 100% GWDM
2.0 and proved close to nothing, so the sample spans both. One dataset
(`bef024b9…`) contributes both forms, which is why it appears twice.

### Reading a case file

```json
{
  "request":  { "method": "POST", "path": "/translate", "query": {...},
                "envelope": "metadata", "contentType": "application/json",
                "bodyFrom": "inputs/<pid>__original.json", "inlineBody": null },
  "response": { "status": 400, "contentType": "...", "body": {...},
                "bodySha256": "...", "rawSha256": "...", "bytes": 198, "attempts": 1 }
}
```

**A case file does not contain its own request body** — that would duplicate
each metadata blob roughly fourteen times. `bodyFrom` names the input file,
and **`envelope` says how to wrap it**:

| `envelope` | Body to send | Used by |
|---|---|---|
| `bare` | the input file's contents, as-is | `/find` |
| `metadata` | `{ "metadata": <input> }` | `/translate`, `/validate` |
| `metadata+extra` | `{ "metadata": <input>, "extra": <inlineBody.extra> }` | the `with-extra` translate case |
| `inline` | `inlineBody` verbatim; ignore `bodyFrom` | the `cases/common/err/*` cases |

`contentType` is the header the harvester sent, not the one it got back — it
matters only for `cases/common/err/find-wrong-content-type.json`, which
deliberately posts `text/plain`. A replay that defaults to `application/json`
reports a parity failure on `/find` that has nothing to do with the rewrite.

Getting this wrong is the single easiest way to produce a phantom parity
failure: `/translate` and `/validate` reject a bare metadata object with an
express-validator 400 (`src/routes/translate.js:111`,
`src/routes/validate.js:80`), so a replay that forgets the envelope will
record a translation failure that has nothing to do with the rewrite.

### The two hashes

- **`bodySha256`** is over `JSON.stringify(response.body)` — recomputable from
  the committed file, so it detects tampering with `body`.
- **`rawSha256`** is over production's exact response bytes, which are *not*
  stored anywhere. It cannot be recomputed from this file. Its only use is
  comparing this capture against a fresh re-harvest of production.

`body` is stored parsed, not as raw text, so the fixtures stay readable and
diffable. A JSON round-trip through Node is not byte-stable, so **PR05 must
compare parsed structures, not strings.** The round-trip is lossy for
duplicate keys, integers above 2^53, `-0` and exponent notation; the corpus
was grepped and contains none of these, but do not assume byte equality.

## Re-harvesting

**`index.json.argv` holds the exact arguments that produced this corpus.**
Replay them rather than retyping the command: the run carried five
`--exclude-pid` flags, and a bare `--limit 6 --pool 250` invocation would
reinstate those datasets and produce a different set.

```bash
eval "TRASER_PROD_URL=https://translate.healthdatagateway.org \
  node scripts/harvest-regression-fixtures.mjs $(node -p \
  "require('./tests/data/regression-fixtures/index.json').argv.map(a=>\"'\"+a.replace(/'/g,\"'\\\\''\")+\"'\").join(' ')")"
```

The `argv` entries contain spaces, so they must be shell-quoted rather than
joined naively.

The script wipes `inputs/` and `cases/` and rewrites `index.json` on every
run, so it is idempotent. The wipe happens only after the Gateway has returned
a dataset pool, so an outage cannot leave you with a deleted corpus. Every
call it makes is read-only: `GET` against the Gateway API, and `POST /find`,
`/translate`, `/validate` against TRASER, all three of which are pure
functions of the request body. `--help` lists the options.

A full run is roughly 110 calls against production.

**Re-harvesting will not reproduce these exact pids.** The sample is drawn
from a live Gateway pool, so the selection moves as production data moves. A
re-harvest is a fresh baseline, not a diff target.

### Personal data

Dataset metadata carries publisher contact addresses, some of which are named
individuals rather than role accounts. The script prints every distinct
email-shaped string it captured at the end of a run, and separately warns on
credential-shaped strings. Review both lists before committing.

**The addresses in this corpus have been reviewed.** All are role or
organisational mailboxes already published on the Gateway
(`phs.edris@phs.scot`, `enquiries@cprd.com`, `saildatabank@swansea.ac.uk`, …),
plus the fictional `contact@example.com` used in the `extra` fixture and a
placeholder `blah.blah@blah.com` that is already in the production record.
Five datasets carrying named-individual addresses were excluded;
`index.json.skipped.excluded` records each pid with its reason. Exclusions
require a reason:

```bash
node scripts/harvest-regression-fixtures.mjs --exclude-pid '<pid>=<why>'
```

Excluding is preferred over redacting: a redacted fixture is no longer a
faithful record of what production returned, which is the only thing these
files are for.

## What the sample is, and is not

- **Six datasets, chosen for shape spread, not volume.** `stratify()` buckets
  candidates by their sorted top-level key set and round-robins across those
  buckets, alternating the rarest with the most common, so a handful of
  datasets spans both the dominant production shape and the odd ones. Do not
  read these six as representative of what the Gateway holds.
- **The spread achieved:** HDRUK 3.0.0 ×2, HDRUK 4.0.0 ×2, GWDM 2.0 ×1
  (canonical), and one input matching no known schema — all four buckets
  production yields.
- **The stratifier is not schema-version aware.** It buckets on the key set,
  which does not separate HDRUK 3.0.0 from 4.0.0. The spread above follows
  from key-set variation, not from any guarantee.
- **Inputs over 250 KB are skipped** (`--max-input-bytes`). Twelve were
  dropped in this run; `index.json.skipped.tooLarge` lists each pid and size.
  Large, deeply nested metadata is where JSONata and AJV are most likely to
  diverge, so this is a real residual blind spot — not a solved problem.
- **No HDRUK 2.1.2 input exists**, so the plan's named
  "HDRUK 2.1.2 → SchemaOrg" case could not be sourced. Production holds no
  such datasets. The multi-hop *class* is still covered: the successful
  `SchemaOrg GoogleRecommended` translations chain via GWDM.
- **Only ACTIVE datasets are harvested.** `/translate`, `/validate` and
  `/find` have no draft/active concept — that distinction is Gateway-side —
  so no API branch is lost.

## Strict-match exclusions

> **Superseded by `tests/regression/allowlist.ts`.** That file is what the
> harness actually enforces and is authoritative; this section is the
> prediction PR01 wrote before the harness existed. Two entries below did not
> survive contact with it — see the notes.

The rewrite deliberately diverges from production on the points below.
PR05's harness must exclude them from strict matching rather than paper over
them.

1. ~~**AJV in-place mutation.**~~ **Withdrawn — this divergence does not
   exist.** PR03 established that nothing in the rewrite clones before
   validating: `structuredClone` appears once, inside `findMatchingSchemas`,
   and `validateMetadata` mutates the caller's object exactly as Express did.
   The per-field coercion/default predicate this entry called for would have
   *widened* the comparison and masked genuine regressions of that shape, so
   it was never implemented. See
   `upgrade-plans/05-ajv-mutation-divergence-unimplemented.md`.

2. **`select_first_matching=false`.** In production the query string was never
   coerced to a boolean, so the reject-on-ambiguous branch was dead. Verified
   across this corpus: all 6 `translate/HDRUK/2.1.2/no-select-first-matching/`
   responses hash identically to their default-parameter siblings. The rewrite
   genuinely rejects ambiguous input-schema matches, so those cases will
   differ, by design. Fires on 1 of the 6 under the baseline pins —
   `RULE_SELECT_FIRST_MATCHING_FALSE`.

3. **`/get/schema` for an unknown schema.** Production leaks an internal
   error — `cases/common/err/get-schema-unknown.json` records
   `{"error": "Cannot read properties of undefined (reading 'schema')"}` with
   a 400. The rewrite returns a clean `Schema X:Y not found`. Match the
   status, not the message. (Note: the repo's root `CLAUDE.md` says this
   message reads `... of null`; the fixture shows `undefined`. The fixture is
   authoritative.)

4. **AJV `allErrors: true`.** The rewrite reports every validation error;
   production stops early. Recorded `errors` arrays are a *subset* of what the
   rewrite produces. Assert containment, not equality —
   `RULE_AJV_ALL_ERRORS` does, and fails if an entry production reported has
   disappeared.

5. **`GET /`.** Production returns JSON `{"message": "Hello from TRASER"}`.
   The rewrite serves the frontend landing page as HTML. Accepted outright —
   the JSON response is obsolete. No fixture is recorded for it.
   `GET /status` **is** recorded (`cases/common/status.json`) and is not
   excluded: it is the likely liveness-probe target, and its shape must not
   drift.

6. **Upstream revision drift.** Not a rewrite divergence and not foreseen here:
   production's `schemata-2` / `traser-mapping-files` revisions cannot be read
   from outside the cluster, so five CRUK cases carry a validation error the
   pinned revisions no longer produce. `RULE_UPSTREAM_REVISION_DRIFT` names
   them individually; `tests/regression/README.md` records how that was
   separated from a real regression.

## The error envelope is the highest-drift-risk surface

Production shapes 4xx bodies with express-validator; the rewrite hand-rolls
the equivalent in `app/lib/errors.server.ts`. That is reproduced-from-scratch
code, so the thirteen `cases/common/err/*` fixtures matter more per byte than
anything else here. Each names the validator it trips:

| Fixture (under `cases/common/err/`) | Trips |
|---|---|
| `translate-empty-body` | `body("metadata").isObject().notEmpty()` — `translate.js:111` |
| `translate-metadata-not-object` | same, non-object value |
| `translate-bad-validate-flag` | `query(["validate_input","validate_output"]).isIn(["0","1"])` — `translate.js:113` |
| `translate-extra-not-object` | `body("extra").optional().isObject()` — `translate.js:112` |
| `validate-empty-body` | `body("metadata").isObject().notEmpty()` — `validate.js:80` |
| `validate-missing-query` | `query("input_schema"/"input_version").exists()` — `validate.js:81` |
| `find-wrong-content-type` | custom content-type validator — `find.js:68` |
| `find-bad-with-errors` | `query("with_errors").isInt({min:0,max:1})` — `find.js:74` |
| `get-schema-missing-name` | `query("name").notEmpty()` — `get.js:166` |
| `get-form-hydration-missing-name` | `query("name").notEmpty()` — `get.js:258` |
| `get-map-missing-params` | four `.notEmpty().bail()` — `get.js:55-58` |
| `list-translations-missing-params` | `query("schema"/"version").notEmpty()` — `list.js:141` |
| `get-schema-unknown` | resolves, then throws internally (exclusion 3) |

The `src/` line references are historical — PR12 deletes that directory.

## What this baseline says about production

Worth knowing before reading a diff and assuming the rewrite broke something.
From `index.json` (104 cases: 55 × 200, 34 × 400, 15 × 500):

Base `/translate` cases, by target:

| Target | Result |
|---|---|
| GWDM 2.0 | 4 × 200, 2 × 400 |
| GWDM 2.1 | 4 × 200, 2 × 400 |
| SchemaOrg GoogleRecommended | 4 × 200, 2 × 400 |
| HDRUK 2.1.2 | **5 × 500**, 1 × 400 |
| SchemaOrg default | **5 × 500**, 1 × 400 |
| CRUK 1.0.0 | 6 × 400 |

- Only translations targeting **GWDM 2.0, GWDM 2.1 and
  SchemaOrg GoogleRecommended** succeed from the production corpus.
- **`HDRUK → 2.1.2` and `SchemaOrg default` 500 on production**, because both
  route through a `GWDM 1.2 → GWDM 1.1` edge that fails:
  `Failed to execute translation between GWDM:1.2 and GWDM:1.1`. Both
  reproduce across every affected input, so they are deterministic rather
  than transient.

  These are faults in the JSONata maps, which live in the separate
  **`traser-mapping-files`** repo, not in TRASER. Nothing in this migration
  fixes or is expected to fix them. They are captured only because the
  baseline records what production returns.
- **`CRUK 1.0.0` fails for every input**, mostly `Output metadata validation
  failed`. There is **no successful CRUK path in this baseline** — PR05 can
  assert only that CRUK still fails, not that it works.
- The 400s on otherwise-working targets are the no-schema-match input:
  `/translate` answers `Input metadata object matched no known schemas`.
- **`extra` has no observable effect on any reachable path.** All 6
  `with-extra` cases hash identically to their plain siblings. The
  `input.*`/`extra.*` JSONata binding is load-bearing in principle, but
  production data cannot currently exercise the `extra` half of it.
- `subsection=summary` **does** change the response, for 4 of 6 inputs, as
  does `validate_input=0&validate_output=0`.

These are production's behaviour, captured deliberately, and none of them is
a TRASER defect — the failing paths belong to `traser-mapping-files` and the
unmatched inputs belong to the datasets. Do not treat them as migration work.

**Staleness warning for PR05.** Because the maps are versioned separately,
`traser-mapping-files` can change underneath these fixtures. If it does, the
recorded 500s stop matching and the harness reports failures that have
nothing to do with the rewrite. Before trusting a red run, re-check
`GET /list/translations` and, if the graph has moved, re-harvest rather than
chasing the diff.
