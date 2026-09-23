import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("/docs", "routes/docs.tsx"),
  route("/status", "routes/api/status.ts"),
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
] satisfies RouteConfig;
