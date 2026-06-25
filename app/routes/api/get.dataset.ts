/**
 * @openapi
 * /get/dataset:
 *   get:
 *     tags: [get]
 *     summary: Fetch a cached dataset by PID
 *     description: Returns the extracted metadata for a dataset identified by its persistent identifier (PID).
 *     parameters:
 *       - name: pid
 *         in: query
 *         required: true
 *         description: Dataset persistent identifier.
 *         schema:
 *           type: string
 *           example: abc123
 *     responses:
 *       '200':
 *         description: Dataset metadata object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       '400':
 *         description: Missing pid parameter.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       '404':
 *         description: Dataset not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
import { readFile } from "fs/promises";
import path from "path";
import { extractMetadata, getDataDir } from "~/lib/cache.server";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const pid = url.searchParams.get("pid");

  if (!pid) {
    return Response.json({ message: "pid query param is required" }, { status: 400 });
  }

  try {
    const content = await readFile(path.join(getDataDir(), `${pid}.json`), "utf-8");
    const data = JSON.parse(content);
    const metadata = extractMetadata(data);

    if (!metadata) {
      return Response.json({ message: `No metadata found for pid ${pid}` }, { status: 404 });
    }

    return Response.json(metadata);
  } catch {
    return Response.json({ message: `Dataset ${pid} not found` }, { status: 404 });
  }
}
