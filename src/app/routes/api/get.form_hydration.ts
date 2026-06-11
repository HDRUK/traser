import jsonata from "jsonata";
import { ensureLoaded, retrieveHydrationSchema } from "~/lib/schema.server";
import { getFormHydrationTemplate } from "~/lib/templates.server";
import { publishMessage } from "~/lib/audit.server";

export async function loader({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const version =
    url.searchParams.get("version") ?? process.env.HYDRATION_MAP_VERSION ?? "";
  const dataTypes = url.searchParams.get("dataTypes") ?? "";

  if (!name) {
    return Response.json({ message: "name query param is required" }, { status: 400 });
  }

  try {
    const [template, source] = await Promise.all([
      getFormHydrationTemplate(name, version),
      retrieveHydrationSchema(name, version),
    ]);

    if (!template || !source) {
      return Response.json({ message: "Hydration template or schema not found" }, { status: 400 });
    }

    const src = source as Record<string, unknown>;
    src.dataTypes = dataTypes.split(",");

    const expression = jsonata(template);
    const result = await expression.evaluate(src);

    publishMessage("GET", "get/form_hydration", `${name}-${version} retrieved`).catch(console.error);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: String(err) },
      { status: 400 }
    );
  }
}
