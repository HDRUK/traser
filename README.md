# HDR metadata TRAnslation SERvice (TRASER)

A microservice for converting health dataset metadata between schema formats —
HDRUK, GWDM, SchemaOrg and CRUK. It exposes a JSON API plus a Swagger UI, and
runs as a single [React Router v7](https://reactrouter.com/) Node process on
port `3001`.

## Quick start

```bash
git clone -b dev https://github.com/HDRUK/traser.git
cd traser
cp env.example .env
npm install
npm run dev
```

The dev server listens on `http://localhost:3001` (override with `PORT`).
Swagger UI is at [http://localhost:3001/docs](http://localhost:3001/docs).

For a production build:

```bash
npm run build
npm start
```

## Environment

`npm run dev` reads `.env` via `dotenv`; `npm start` reads it via Node's
`--env-file-if-exists`. Neither is read inside the container image, so in
Kubernetes every variable below must come from the pod environment.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Listen port |
| `SCHEMA_LOCATION` | — | URL or local path to the `schemata-2` root. Anything not starting with `http` is read from disk (e.g. `../schemata-2`) |
| `TEMPLATES_LOCATION` | — | URL or local path to the `traser-mapping-files` root |
| `CACHE_REFRESH_STDTLL` | `3600` | Schema/template cache TTL in seconds, and the schema-reload interval |
| `HYDRATION_MAP_VERSION` | — | Default version for `/get/form_hydration` when `version` is omitted |
| `MAX_BODY_MB` | `10` | Request bodies above this are rejected with `413` |
| `AUDIT_LOG_ENABLED` | `0` | Set to `1` to publish audit events to GCP Pub/Sub |
| `PUBSUB_PROJECT_ID`, `PUBSUB_TOPIC_NAME` | — | Pub/Sub target, used only when auditing is enabled |

Without `SCHEMA_LOCATION` the schema loader has nothing to compile and every
schema-backed endpoint returns `500`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/status` | Liveness probe. Returns `{"message":"ok"}` without touching schemas |
| `POST` | `/translate` | Translate a metadata document to another schema |
| `POST` | `/validate` | Validate a metadata document against a schema |
| `POST` | `/find` | List which schemas a metadata document matches |
| `GET` | `/list/schemas` | Available schemas and versions |
| `GET` | `/list/templates` | Available translation templates |
| `GET` | `/list/translations` | Translation routes reachable from a given schema |
| `GET` | `/get/schema` | A schema definition |
| `GET` | `/get/map` | A JSONata translation map |
| `GET` | `/get/form_hydration` | A hydrated form schema |
| `GET` | `/openapi.json` | The OpenAPI 3 spec |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/` | Landing page |

Full request and response schemas are in Swagger UI; the examples below are a
starting point. `tests/data/` holds a sample metadata document per schema —
each file is a bare document, so `/translate` and `/validate`, which expect a
`{"metadata": ...}` wrapper, need it wrapped.

### Translate

```bash
curl -X POST 'http://localhost:3001/translate?input_schema=HDRUK&input_version=2.1.2&output_schema=GWDM&output_version=1.0' \
  -H 'Content-Type: application/json' \
  -d "$(jq -s '{metadata: .[0], extra: .[1]}' tests/data/hdrukv211.json tests/data/extra_hdrukv211.json)"
```

`extra` carries values the target schema requires but the source document does
not hold — `gatewayId` and `gatewayPid`, for example. Translating the HDRUK
fixture without it fails output validation.

Query parameters are all optional:

| Parameter | Default | Effect |
|---|---|---|
| `input_schema`, `input_version` | auto-detected | Source schema. Detected from the document when omitted |
| `output_schema`, `output_version` | server default | Target schema |
| `validate_input`, `validate_output` | `1` | Set to `0` to skip that validation step |
| `subsection` | — | Translate and validate only a named subsection |
| `select_first_matching` | `true` | Set to `false` to error rather than pick the first match when auto-detection is ambiguous |

Translation is skipped and the document returned unchanged when the input and
output schema and version are identical.

Multi-hop routes are resolved automatically by running Dijkstra's algorithm
over the available templates, so a request only needs the endpoints of the
chain. There is no HDRUK 2.1.2 → GWDM 2.0 template, for instance, and the
request below is served by chaining three:

```bash
curl -X POST 'http://localhost:3001/translate?input_schema=HDRUK&input_version=2.1.2&output_schema=GWDM&output_version=2.0' \
  -H 'Content-Type: application/json' \
  -d "$(jq -s '{metadata: .[0], extra: .[1]}' tests/data/hdrukv211.json tests/data/extra_hdrukv211.json)"
```

`/list/translations` shows what is reachable from a given schema — note that it
names its parameters `schema` and `version`, not `input_schema`/`input_version`:

```bash
curl 'http://localhost:3001/list/translations?schema=HDRUK&version=2.1.2'
```

```json
["HDRUK:2.1.2 -> GWDM:1.1 -> GWDM:1.2 -> GWDM:2.0", "..."]
```

`400` is returned when no route exists.

### Find

`/find` is the exception: it takes the metadata document on its own, with no
wrapper.

```bash
curl -X POST http://localhost:3001/find \
  -H 'Content-Type: application/json' \
  -d @tests/data/gdmv1.json
```

Returns every known schema with a `matches` boolean:

```json
[
  { "name": "HDRUK", "version": "2.1.2", "matches": false },
  { "name": "GWDM", "version": "1.0", "matches": true }
]
```

### Validate

```bash
curl -X POST 'http://localhost:3001/validate?input_schema=GWDM&input_version=1.0' \
  -H 'Content-Type: application/json' \
  -d "$(jq '{metadata: .}' tests/data/gdmv1.json)"
```

Returns `200` with `{"details": "all ok"}`, or `400` with the full AJV error
array.

### Get

```bash
curl 'http://localhost:3001/get/schema?name=GWDM&version=1.0'
curl 'http://localhost:3001/get/map?input_schema=HDRUK&input_version=2.1.2&output_schema=GWDM&output_version=1.0'
curl 'http://localhost:3001/get/form_hydration?name=HDRUK&version=2.2.1'
```

## Docker

```bash
# production image (multi-stage build, serves build/ on 3001)
docker build -t traser .
docker run --rm -p 3001:3001 --env-file .env traser

# development image (runs npm run dev)
docker build -f Dockerfile.dev -t traser-dev .
docker run --rm -p 3001:3001 --env-file .env traser-dev
```

Leave values in `.env` unquoted. `dotenv` and Node's `--env-file` strip wrapping
quotes; `docker run --env-file` does not, so under that form a quoted value
reaches the service with its quotes attached.

## Run via Tilt

Enable TRASER in the `gateway-api-2` `tiltconf.json`:

```json
{
    "traserServiceRoot": "<path to this checkout>",
    "traserEnabled": true
}
```

`tilt up` exposes TRASER on port `8002`. To reach it directly instead:

```bash
kubectl port-forward <traser pod name> 3001:3001
```

## Tests

Integration tests run over HTTP against a server you start yourself, so run
them in a second terminal:

```bash
npm run dev     # terminal 1
npm test        # terminal 2
```

They target `TEST_BASE_URL`, which defaults to `http://localhost:3001`. Unit
tests need no server:

```bash
npm run test:unit
```

## Scripts

| Script | Does |
|---|---|
| `npm run dev` | React Router dev server with hot reload |
| `npm run build` | Production build into `build/`, then generates `build/openapi.json` |
| `npm start` | Serves the production build |
| `npm test` | Integration tests (needs a running server) |
| `npm run test:unit` | Unit tests |
| `npm run typecheck` | Route typegen + `tsc` |
| `npm run lint` | ESLint |

## Layout

```
app/
  root.tsx              # Layout, theme, and the middleware enforcing security
                        #   headers and MAX_BODY_MB
  routes.ts             # Route table
  routes/               # home.tsx, docs.tsx
    api/                # One file per JSON endpoint (loader/action only)
  lib/                  # Server-only modules; *.server.ts never reach the client
    schema.server.ts        # AJV compilation, schema matching, periodic reload
    templates.server.ts     # JSONata template loading and the template index
    translation.server.ts   # translate(), schema detection, translate + validate
    graph.server.ts         # Translation graph and Dijkstra routing
    errors.server.ts        # Shared error shaping
    audit.server.ts         # Pub/Sub audit publisher
    ttlCache.server.ts      # TTL cache used by the schema and template loaders
tests/                  # Integration tests; unit/ holds the server-free suite
chart/traser/           # Helm chart (service 8002 → container 3001)
```

Schemas are fetched from `SCHEMA_LOCATION` and compiled by AJV under the cache
key `{name}:{version}`. AJV runs with `coerceTypes` and `useDefaults`, so it
mutates the document it validates — callers clone first. Translation templates
are JSONata strings fetched from
`TEMPLATES_LOCATION/maps/{OutputModel}/{outputVersion}/{InputModel}/{inputVersion}/translation.jsonata`
and evaluated against `{ input: metadata, extra: extra }`.

The Pydantic sources for every schema live in
[HDRUK/schemata-2](https://github.com/HDRUK/schemata-2); the JSONata templates
live in
[HDRUK/traser-mapping-files](https://github.com/HDRUK/traser-mapping-files).
