import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  // ── Frontend pages ──────────────────────────────────────────────────────
  index("routes/home.tsx"),
  route("/results", "routes/results.tsx"),
  route("/benchmark", "routes/benchmark.tsx"),
  route("/schema-graph", "routes/schema-graph.tsx"),
  route("/schema-view", "routes/schema-view.tsx"),
  route("/playground", "routes/playground.tsx"),
  route("/docs", "routes/docs.tsx"),

  // ── API resource routes (no UI component — return JSON Response objects) ─
  route("/openapi.json", "routes/api/openapi.json.ts"),
  route("/translate", "routes/api/translate.ts"),
  route("/validate", "routes/api/validate.ts"),
  route("/find", "routes/api/find.ts"),
  route("/list/schemas", "routes/api/list.schemas.ts"),
  route("/list/templates", "routes/api/list.templates.ts"),
  route("/list/translations", "routes/api/list.translations.ts"),
  route("/get/schema", "routes/api/get.schema.ts"),
  route("/get/map", "routes/api/get.map.ts"),
  route("/get/form_hydration", "routes/api/get.form_hydration.ts"),
  route("/list/datasets", "routes/api/list.datasets.ts"),
  route("/get/dataset", "routes/api/get.dataset.ts"),
] satisfies RouteConfig;
