import { getDatasetIndex } from "~/lib/cache.server";

export async function loader() {
  const datasets = await getDatasetIndex();
  return Response.json(datasets);
}
