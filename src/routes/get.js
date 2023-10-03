const express = require("express");
const { getSchema } = require("../middleware/schemaHandler");
const { getTemplate } = require("../middleware/templateHandler");
const { query, validationResult, matchedData } = require("express-validator");
const router = express.Router();

/**
 * @swagger
 * /get/map:
 *   get:
 *     summary: Retrieve a template or mapping file
 *     description: Retrieve a template or mapping file from the current cache
 *     parameters:
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *         description: The output schema name.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         description: The input schema name.
 *     responses:
 *       200:
 *         description: Template or mapping retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mapping:
 *                   type: object
 *                   description: The retrieved template or mapping.
 */
router.get(
    "/map",
    [query("to").notEmpty().escape(), query("from").notEmpty().escape()],
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({
                message: "Invalid query parameters.",
                errors: result.array(),
            });
        }

        const queryString = matchedData(req);
        const output_model_name = queryString["to"];
        const input_model_name = queryString["from"];

        const template = getTemplate(output_model_name, input_model_name);
        if (template == null) {
            return res.status(400).json({
                error: "Template file is null!",
                details: `Could not retrieve the template for output:${output_model_name} input:${input_model_name}`,
            });
        }

        res.send({
            from: input_model_name,
            to: output_model_name,
            translation_map: template,
        });
    }
);

/**
 * @swagger
 * /get/schema:
 *   get:
 *     summary: Retrieve a schema by name
 *     description: Retrieve a schema by its name from the cache.
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         required: true
 *         description: The name of the schema to retrieve.
 *       - in: query
 *         name: version
 *         schema:
 *           type: string
 *         description: The version of the schema to retrieve
 *     responses:
 *       200:
 *         description: Schema retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name:
 *                   type: string
 *                   description: The name of the retrieved schema.
 *                 schema:
 *                   type: object
 *                   description: The retrieved schema.
 *       400:
 *         description: Bad request due to invalid query parameters.
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
 *                     $ref: '#/components/schemas/ValidationError'
 */
router.get(
    "/schema",
    [query("name").notEmpty().escape(), query("version").optional()],
    async (req, res) => {
        // possibly repeating code here..
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({
                message: "Invalid query parameters.",
                errors: result.array(),
            });
        }

        const queryString = matchedData(req);
        const schemaModelName = queryString["name"];
        const schemaModelVersion = queryString["version"] || "";

        try {
            getSchema(schemaModelName, schemaModelVersion)
                .then((validator) => {
                    res.send({
                        name: schemaModelName,
                        version: schemaModelVersion,
                        schema: validator.schema,
                    });
                })
                .catch((error) => {
                    res.status(400).json({
                        error: error.message,
                    });
                });
        } catch (error) {
            res.status(400).json({
                error: error.message,
            });
        }
    }
);

module.exports = router;
