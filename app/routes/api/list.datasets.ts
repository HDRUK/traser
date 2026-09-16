// Internal endpoint — intentionally undocumented (omitted from the OpenAPI/Swagger spec).
import { getDatasetIndex } from "~/lib/cache.server";

export async function loader() {
  const datasets = await getDatasetIndex();
  return Response.json(datasets);
}
