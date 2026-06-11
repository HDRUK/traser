import { ensureLoaded, validateMetadata, validateMetadataSection } from "~/lib/schema.server";
import { publishMessage } from "~/lib/audit.server";

export async function action({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const inputSchema = url.searchParams.get("input_schema");
  const inputVersion = url.searchParams.get("input_version");
  const subsection = url.searchParams.get("subsection") ?? undefined;

  if (!inputSchema || !inputVersion) {
    return Response.json(
      { message: "input_schema and input_version query params are required" },
      { status: 400 }
    );
  }

  let body: { metadata?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const { metadata } = body;
  if (!metadata || typeof metadata !== "object") {
    return Response.json({ message: "metadata must be a non-empty object" }, { status: 400 });
  }

  const errors = subsection
    ? await validateMetadataSection(metadata, inputSchema, inputVersion, subsection)
    : await validateMetadata(metadata, inputSchema, inputVersion);

  if (errors.length > 0) {
    publishMessage("POST", "validate", `Validation failed for ${inputSchema}:${inputVersion}`).catch(console.error);
    return Response.json({ error: "metadata validation failed", details: errors, data: metadata }, { status: 400 });
  }

  publishMessage("POST", "validate", `Validated as ${inputSchema}:${inputVersion}`).catch(console.error);
  return Response.json({ details: "all ok" });
}
