/**
 * @openapi
 * /list/datasets:
 *   get:
 *     tags: [list]
 *     summary: List cached datasets
 *     description: Returns metadata for all datasets currently cached on disk.
 *     responses:
 *       '200':
 *         description: Array of dataset metadata objects.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 */
import { getDatasetIndex } from "~/lib/cache.server";

export async function loader() {
  const datasets = await getDatasetIndex();
  return Response.json(datasets);
}
