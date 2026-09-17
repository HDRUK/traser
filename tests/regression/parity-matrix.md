<!-- Snapshot. Regenerate with:
       cp env.example .env && node scripts/apply-regression-pins.mjs .env
       npm run build && npm start &
       REGRESSION_MATRIX_OUT=tests/regression/parity-matrix.md npm test -- regression-replay
     A normal run writes to build/regression-matrix.md and does not touch this file. -->

## Production parity matrix

Replayed **104** golden fixtures captured from `https://translate.healthdatagateway.org` on 2026-09-16 against the rewrite.

🟢 byte-for-byte identical to production · 🟡 differs only by a named, accepted divergence · 🔴 unexplained difference

| Endpoint | Cases | Exact | Accepted | Unexplained | Rules | |
|---|---:|---:|---:|---:|---|:--:|
| `GET /get/form_hydration` | 2 | 2 | 0 | 0 | — | 🟢 |
| `GET /get/map` | 2 | 1 | 1 | 0 | GET_MAP_MULTI_HOP | 🟡 |
| `GET /get/schema` | 3 | 2 | 1 | 0 | GET_SCHEMA_UNKNOWN | 🟡 |
| `GET /list/schemas` | 1 | 1 | 0 | 0 | — | 🟢 |
| `GET /list/templates` | 1 | 1 | 0 | 0 | — | 🟢 |
| `GET /list/translations` | 2 | 2 | 0 | 0 | — | 🟢 |
| `GET /status` | 1 | 1 | 0 | 0 | — | 🟢 |
| `POST /find` | 14 | 8 | 6 | 0 | AJV_ALL_ERRORS | 🟡 |
| `POST /translate` | 64 | 55 | 9 | 0 | AJV_ALL_ERRORS, SELECT_FIRST_MATCHING_FALSE, UPSTREAM_REVISION_DRIFT | 🟡 |
| `POST /validate` | 14 | 13 | 1 | 0 | AJV_ALL_ERRORS | 🟡 |

**Overall 🟡 — 86 exact, 18 accepted divergence, 0 unexplained, across 104 calls.**

### `POST /translate` by output schema

| Target | Cases | Exact | Accepted | Unexplained | Rules | |
|---|---:|---:|---:|---:|---|:--:|
| `CRUK 1.0.0` | 6 | 1 | 5 | 0 | UPSTREAM_REVISION_DRIFT | 🟡 |
| `GWDM 2.0` | 28 | 26 | 2 | 0 | AJV_ALL_ERRORS | 🟡 |
| `GWDM 2.1` | 6 | 5 | 1 | 0 | AJV_ALL_ERRORS | 🟡 |
| `HDRUK 2.1.2` | 12 | 11 | 1 | 0 | SELECT_FIRST_MATCHING_FALSE | 🟡 |
| `SchemaOrg default` | 6 | 6 | 0 | 0 | — | 🟢 |
| `SchemaOrg GoogleRecommended` | 6 | 6 | 0 | 0 | — | 🟢 |

### Accepted divergences

| Rule | Fired | Why it is accepted |
|---|:--:|---|
| `UPSTREAM_REVISION_DRIFT` | 5 | Production's schemata-2 / traser-mapping-files revisions are not knowable from outside the cluster. On these five CRUK cases the pinned revisions populate `identifier`, so production's one validation error no longer applies. The Express service on identical pins returns the same body as the rewrite, so this is upstream configuration rather than a rewrite regression. |
| `AJV_ALL_ERRORS` | 10 | AJV now runs with `allErrors: true`, so validation-error arrays are complete rather than truncated at the first failure. Every entry production reported is asserted to still be present. |
| `SELECT_FIRST_MATCHING_FALSE` | 1 | `select_first_matching=false` was dead code in Express (the query string was never coerced to a boolean). The rewrite honours it and rejects input that matches more than one schema. |
| `GET_SCHEMA_UNKNOWN` | 1 | Express leaked `Cannot read properties of undefined (reading 'schema')` for an unknown schema. The rewrite returns the same 400 with a clean `Schema <name>:<version> not found`. |
| `GET_MAP_MULTI_HOP` | 1 | `/get/map` keeps every field production returned and adds `translation_path` + `translation_maps`, so a pair with no direct map exposes the chain that TRASER would actually apply instead of just `translation_map: null`. |
