/**
 * @openapi
 * /status:
 *   get:
 *     tags: [list]
 *     summary: Liveness probe.
 *     description: >
 *       Returns 200 as long as the process is serving. Does not touch schemas,
 *       templates or the dataset cache, so it stays cheap and cannot fail for
 *       reasons unrelated to liveness.
 *     responses:
 *       '200':
 *         description: The service is up.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: ok
 */
export async function loader() {
  return Response.json({ message: "ok" });
}
