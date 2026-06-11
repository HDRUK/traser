import { getTemplate } from "~/lib/templates.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const inputSchema = url.searchParams.get("input_schema");
  const inputVersion = url.searchParams.get("input_version");
  const outputSchema = url.searchParams.get("output_schema");
  const outputVersion = url.searchParams.get("output_version");

  if (!inputSchema || !inputVersion || !outputSchema || !outputVersion) {
    return Response.json(
      { message: "input_schema, input_version, output_schema, output_version are all required" },
      { status: 400 }
    );
  }

  const template = await getTemplate(inputSchema, inputVersion, outputSchema, outputVersion);
  if (!template) {
    return Response.json(
      {
        error: "Translation not found",
        details: `No map for ${inputSchema}-${inputVersion} → ${outputSchema}-${outputVersion}`,
      },
      { status: 400 }
    );
  }

  publishMessage("GET", "get/map", `Map ${inputSchema}-${inputVersion} → ${outputSchema}-${outputVersion} retrieved`).catch(console.error);
  return Response.json({
    input_schema: inputSchema,
    input_version: inputVersion,
    output_schema: outputSchema,
    output_version: outputVersion,
    translation_map: template,
  });
}
