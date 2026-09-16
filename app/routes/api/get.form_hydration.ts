/**
 * @openapi
 * /get/form_hydration:
 *   get:
 *     tags: [get]
 *     summary: Fetch a hydrated form schema
 *     description: Applies a JSONata form-hydration template to a schema definition and returns the result. Used to build dynamic form configurations.
 *     parameters:
 *       - name: name
 *         in: query
 *         required: true
 *         description: Schema name to hydrate (e.g. HDRUK).
 *         schema:
 *           type: string
 *           example: HDRUK
 *       - name: version
 *         in: query
 *         description: Schema version. Falls back to the HYDRATION_MAP_VERSION env var if omitted.
 *         schema:
 *           type: string
 *       - name: dataTypes
 *         in: query
 *         description: Comma-separated list of data types to inject into the hydration source.
 *         schema:
 *           type: string
 *           example: "Genomics,Imaging"
 *     responses:
 *       '200':
 *         description: Hydrated form schema.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '400':
 *         description: Missing parameters or hydration template not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
import jsonata from "jsonata";
import { ensureLoaded, retrieveHydrationSchema } from "~/lib/schema.server";
import { getFormHydrationTemplate } from "~/lib/templates.server";
import { publishMessage } from "~/lib/audit.server";
import { fieldError, invalidParams } from "~/lib/errors.server";

export async function loader({ request }: { request: Request }) {
  await ensureLoaded();

  const url = new URL(request.url);
  const name = url.searchParams.get("name");
  const version =
    url.searchParams.get("version") ?? process.env.HYDRATION_MAP_VERSION ?? "";
  const dataTypes = url.searchParams.get("dataTypes") ?? "";

  if (!name) {
    return invalidParams("Invalid query parameters.", [
      fieldError("Invalid value", "name", "query"),
    ]);
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

    // A JSONata expression that matches nothing evaluates to `undefined`, which
    // JSON.stringify turns into a malformed empty body — return a 400 instead.
    if (result === undefined) {
      publishMessage(
        "GET",
        "get/form_hydration",
        `${name}-${version} failed to hydrate`
      ).catch(console.error);
      return Response.json({ message: "Hydration failed." }, { status: 400 });
    }

    publishMessage("GET", "get/form_hydration", `${name}-${version} retrieved`).catch(console.error);
    return Response.json(result);
  } catch (err) {
    publishMessage(
      "GET",
      "get/form_hydration",
      `Failed to retrieve ${name}-${version}`
    ).catch(console.error);
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }
}
