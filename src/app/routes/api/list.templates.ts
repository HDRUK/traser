import { getAvailableTemplates } from "~/lib/templates.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader() {
  const templates = await getAvailableTemplates();
  publishMessage("GET", "list/templates", "Retrieved available templates").catch(console.error);
  return Response.json(templates);
}
