const express = require("express");
const jsonata = require("jsonata");
const publishMessage = require("../middleware/auditHandler");
const { getAvailableTemplates } = require("../middleware/templateHandler");
const { getAvailableSchemas } = require("../middleware/schemaHandler");

const { TranslationGraph } = require("./utils/graphHelpers");

const { query, validationResult, matchedData } = require("express-validator");

const router = express.Router();

/**
 * @swagger
 * /list/templates:
 *   get:
 *     summary: Retrieve available template mappings
 *     description: Retrieve available template mappings from the current cache
 *   responses:
 *     200:
 *        description: Successful response with a list of templates.
 *        content:
 *           application/json:
 *              example:
 *                 - output_model: HDRUK
 *                   output_version: 2.1.2
 *                   input_model: datasetv2
 *                   input_version: default
 *                 - output_model: HDRUK
 *                   output_version: 2.1.2
 *                   input_model: GWDM
 *                   input_version: 1.0
 *     500:
 *        description: Internal server error.
 *        content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Description of the error.
 */
router.get("/templates", async (req, res) => {
    const templates = await getAvailableTemplates();
    publishMessage(
        "GET",
        "list/templates",
        `Retrieved available template mappings`
    );
    res.send(templates);
});

/**
 * @swagger
 * /list/schemas:
 *   get:
 *     summary: Retrieve available schema names
 *     description: Retrieve available schema names from the cache.
 *     responses:
 *       200:
 *         description: List of available schema names.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               description: List of available schema names.
 *               items:
 *                 type: string
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Description of the error.
 */
router.get("/schemas", async (req, res) => {
    const schemas = await getAvailableSchemas();
    publishMessage(
        "GET",
        "list/schemas",
        `Retrieved available schemas`
    );
    res.send(schemas);
});

/**
 * @swagger
 * /translations:
 *   get:
 *     summary: Retrieve available schema translations
 *     description: Retrieve available schema translations from the cache.
 *     parameters:
 *       - in: query
 *         name: schema
 *         required: true
 *         description: The schema name.
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         required: true
 *         description: The schema version.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of available translations.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               description: List of available translations.
 *               items:
 *                 type: string
 *       400:
 *         description: Bad request.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Description of the error.
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       message:
 *                         type: string
 *                         description: Description of the error.
 */
router.get(
    "/translations",
    [query("schema").notEmpty(), query("version").notEmpty()],
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            publishMessage(
                "GET",
                "translations",
                `Failed to retrieve available translations`
            );
            return res.status(400).json({
                message: "Translation has failed.",
                errors: result.array(),
            });
        }

        const { schema, version } = matchedData(req);

        const startNode = `${schema}:${version}`;
        const availableSchemas = await getAvailableSchemas();
        const allSchemas = [];
        for (const key in availableSchemas) {
            availableSchemas[key].forEach((value) => {
                allSchemas.push(`${key}:${value}`);
            });
        }

        const templatesGraph = await new TranslationGraph();
        const routes = allSchemas
            .map((endNode) => {
                let predecessors = templatesGraph.dijkstra(startNode);
                const { translationsToApply, error } = templatesGraph.getPath(
                    startNode,
                    endNode,
                    predecessors
                );
                if (!translationsToApply) return;
                return translationsToApply
                    .map((e) => `${e.name}:${e.version}`)
                    .join(" -> ");
            })
            .filter((e) => e != null);

        publishMessage(
            "GET",
            "translations",
            `Retrieved available translations for ${schema}:${version}`
        );
        return res.send(routes);
    }
);

module.exports = router;
