# TRASER — metadata TRAnslation SERvice

TRASER converts health-dataset metadata between the schema formats used across
the HDR UK Gateway: **HDRUK**, **GWDM**, **CRUK**, and **Schema.org**. It also
validates metadata against those schemas and can auto-detect which schema a
document belongs to.

It is a single [React Router v7](https://reactrouter.com) app — the JSON API and
a small developer UI run as one Node process on port **3001**.

## Quick start

```bash
cp env.example .env      # defaults point at the public HDRUK schema/template repos
npm install
npm run dev              # http://localhost:3001
```

Or with Docker:

```bash
docker-compose up --build   # exposes :3001
```

Schemas and translation maps are fetched at runtime from `SCHEMA_LOCATION` and
`TEMPLATES_LOCATION`:

- Schemas — [HDRUK/schemata](https://github.com/HDRUK/schemata)
- Translation maps — [HDRUK/traser-mapping-files](https://github.com/HDRUK/traser-mapping-files)

Both default to the public `dev` branches on GitHub; set either to a local path
(e.g. a sibling checkout) to develop offline. See `env.example` for all settings.

## How it works

- **Schemas** are fetched from `SCHEMA_LOCATION`, compiled with AJV, and reloaded
  periodically so upstream changes are picked up without a restart.
- **Translations** are [JSONata](https://jsonata.org) templates fetched from
  `TEMPLATES_LOCATION`. Each template is one edge in a directed graph; a request
  with no direct template is routed multi-hop via Dijkstra (e.g. HDRUK → GWDM →
  Schema.org).
- **Auto-detect / validate** run the document against every known schema with AJV.

## API

Base URL `http://localhost:3001`. Interactive Swagger docs at **`/docs`**
(raw spec at `/openapi.json`).

| Method | Path | Purpose |
|---|---|---|
| POST | `/translate` | Translate metadata between schemas (auto-detects input, defaults output to latest GWDM) |
| POST | `/validate` | Validate metadata against `input_schema` + `input_version` |
| POST | `/find` | Return which known schemas the posted metadata matches |
| GET | `/get/schema` | Fetch a compiled JSON Schema (`name`, `version`) |
| GET | `/get/map` | Fetch the raw JSONata translation map between two schemas |
| GET | `/get/form_hydration` | Fetch a hydrated form template for a schema |
| GET | `/list/schemas` | Available schemas and versions |
| GET | `/list/templates` | Available translation templates |
| GET | `/list/translations` | Reachable translation routes from a schema |

### Examples

Translate HDRUK 2.1.2 → GWDM 1.0:

```bash
curl -X POST 'http://localhost:3001/translate?input_schema=HDRUK&input_version=2.1.2&output_schema=GWDM&output_version=1.0' \
  -H 'Content-Type: application/json' \
  -d '{ "metadata": { ... }, "extra": { ... } }'
```

Query parameters are optional — `POST /translate` with just `{ "metadata": ... }`
auto-detects the input schema and translates to the latest GWDM. If the input
already matches the output schema, the metadata is returned unchanged.

Validate:

```bash
curl -X POST 'http://localhost:3001/validate?input_schema=GWDM&input_version=1.0' \
  -H 'Content-Type: application/json' \
  -d '{ "metadata": { ... } }'
# 200 { "details": "all ok" }
# 400 { "error": "metadata validation failed", "details": [ ... ], "data": { ... } }
```

Find matching schemas:

```bash
curl -X POST http://localhost:3001/find \
  -H 'Content-Type: application/json' \
  -d '{ ...metadata... }'
# [ { "name": "GWDM", "version": "1.0", "matches": true }, ... ]
```

## UI pages

- `/playground` — JSONata sandbox: paste metadata, pick a mapping, and see the
  translated output and validation result live.
- `/schema-graph` — Mermaid diagram of the translation graph.
- `/schema-view` — Mermaid class diagram of a chosen schema.
- `/results`, `/benchmark` — admin dashboards (schema-test matrix and translation
  latency runner); these require a Gateway auth cookie.

## Caching

TRASER keeps a disk cache under `DATA_DIR` (default `./data`) — one file per
Gateway dataset plus the test-results matrix and benchmark runs. A background
sweep bounds its growth: dataset files expire after `DATA_CACHE_TTL_DAYS`
(default 7), benchmark runs after `BENCHMARK_TTL_DAYS`, and heavy embedded result
bodies after `RESULT_BODY_TTL_DAYS`, with optional `DATA_MAX_BYTES` /
`DATA_MAX_FILES` hard caps. Point `DATA_DIR` at a dedicated volume in production.

## Testing

```bash
npm run test:unit   # unit tests — no server needed
npm run dev         # in one terminal…
npm test            # …integration tests (fetch against http://localhost:3001)
npm run typecheck
```

## Deployment

`Dockerfile` / `Dockerfile.prod` build the service and `docker-compose.yml` runs
it locally on :3001. For Kubernetes dev via Tilt, enable TRASER in the
gateway-api `tiltconf.json` (`traserServiceRoot`, `traserEnabled: true`) —
`tilt up` forwards it to :8002.
