# Production regression replay

Re-issues every request in `tests/data/regression-fixtures/` against a running
TRASER and fails on any difference that is not covered by a named entry in
`allowlist.ts`. `regression-replay.test.ts` is the driver; it also writes a
red/amber/green parity matrix to `build/regression-matrix.md`.

```bash
cp env.example .env
node scripts/apply-regression-pins.mjs .env   # see "Pins" below — not optional
npm run build && npm start &
npm test                                      # or: npm test -- regression-replay
```

## What counts as a pass

| | Meaning |
|---|---|
| 🟢 exact | status, `content-type` and body are structurally identical to what production returned |
| 🟡 accepted | every difference is covered by a rule in `allowlist.ts`, and that rule asserted the new shape |
| 🔴 unexplained | at least one difference no rule claims — the build fails |

Object key order is not compared (JSON object order is not contractual).
Everything else is: arrays are order-sensitive, extra keys are failures, and a
missing key is a failure.

## Pins

`pins.json` freezes `SCHEMA_LOCATION` and `TEMPLATES_LOCATION` to the
`schemata-2` and `traser-mapping-files` revisions production was serving when
the corpus was harvested. Without them the replay measures schema drift rather
than the rewrite: on the `dev` tip of both repos, 37 of 104 cases differ, and
none of those differences are caused by TRASER.

The revisions were found by binary search over both repositories until
`/list/schemas`, `/list/templates` and `/list/translations` replayed
byte-identically. `regression-replay.test.ts` asserts those three first, so a
drifted server fails with an actionable message instead of 30 confusing ones.

CI applies the pins in its own step; `env.example` deliberately still points at
`dev` so ordinary development sees current schemas.

## Re-deriving the allow-list

The fixtures are the *only* record of production, and production's exact
configuration cannot be read from outside the cluster. The stronger control is
to run the Express service this rewrite replaces, on the same pins, and diff
the two live services:

```bash
git worktree add ../traser-express --detach origin/dev
cd ../traser-express && npm ci && cp ../traser/.env .env
sed -i '' 's|^PORT=.*|PORT=3002|' .env && npm start &
```

Then replay the corpus against `:3002` and `:3001` and compare the two
responses to each other rather than to the fixtures. Every rule in
`allowlist.ts` must survive that comparison; `UPSTREAM_REVISION_DRIFT` exists
*because* it does not — the two services agree exactly on those five cases, so
the difference is production's configuration and not the rewrite.

`src/` is deleted in WS1 PR12, which is when this procedure and the pins retire.

## Adding a rule

A rule is not a skip. `evaluate()` must either return `null` (abstain) or
assert what the new response should look like and return a `covers()` predicate
naming exactly the diffs it accounts for; anything it does not claim still
fails. Throwing from `evaluate()` marks the case unexplained with the thrown
message, which is how the shape assertions report.

`expectedToFire` is checked both ways: a rule that stops firing fails the build
just as loudly as an unexplained diff, so a rule cannot quietly outlive the
behaviour it describes.
