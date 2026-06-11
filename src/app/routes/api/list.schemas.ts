import { ensureLoaded, getAvailableSchemas } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader() {
  await ensureLoaded();
  const schemas = await getAvailableSchemas();
  publishMessage("GET", "list/schemas", "Retrieved available schemas").catch(console.error);
  return Response.json(schemas);
}
