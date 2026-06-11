import { ensureLoaded, getSchema } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const version = url.searchParams.get("version") ?? "";

  if (!name) {
    return Response.json({ message: "name query param is required" }, { status: 400 });
  }

  const validator = getSchema(name, version);
  if (!validator?.schema) {
    return Response.json({ error: `Schema ${name}:${version} not found` }, { status: 400 });
  }

  publishMessage("GET", "get/schema", `${name}-${version} retrieved`).catch(console.error);
  return Response.json({ name, version, schema: validator.schema });
}
