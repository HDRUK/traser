import { ensureLoaded, findMatchingSchemas } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function action({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const withErrors = url.searchParams.get("with_errors") === "1";

  if (request.headers.get("content-type")?.includes("application/json") === false) {
    return Response.json({ errors: ["Invalid content type. Expected JSON."] }, { status: 400 });
  }

  let metadata: unknown;
  try {
    metadata = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const result = await findMatchingSchemas(metadata, withErrors);
  publishMessage("POST", "find", "Validated metadata against available schemas").catch(console.error);
  return Response.json(result);
}
