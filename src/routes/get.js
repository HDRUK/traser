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
 *         name: output_schema
 *         required: true
 *         schema:
 *           type: string
 *         description: Output metadata model name
 *       - in: query
 *         name: output_version
 *         required: true
 *         schema:
 *           type: string
 *         description: Output metadata model version
 *       - in: query
 *         name: output_model
 *         required: true
 *         schema:
 *           type: string
 *         description: Input metadata model name. If unknown, the route will attempt to determine which schema the metadata matches and use that as the input metadata model name
 *       - in: query
 *         name: output_version
 *         required: true
 *         schema:
 *           type: string
 *         description: Input metadata model version. If unknown, the route will attempt to determine which schema version the metadata matches and use that as the input metadata model version
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
    [
        query("output_schema").notEmpty().bail(),
        query("output_version").notEmpty().bail(),
        query("input_schema").notEmpty().bail(),
        query("input_version").notEmpty().bail(),
    ],
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({
                message: "Invalid query parameters.",
                errors: result.array(),
            });
        }

        const queryString = matchedData(req);
        const inputModelName = queryString["input_schema"];
        const inputModelVersion = queryString["input_version"];
        const outputModelName = queryString["output_schema"];
        const outputModelVersion = queryString["output_version"];

        let template;
        try {
            template = await getTemplate(
                inputModelName,
                inputModelVersion,
                outputModelName,
                outputModelVersion
            );
        } catch (error) {
            return res.status(400).json({
                error: "Translation not found",
                message: error.message,
                details: `Translation for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion} is not implemented`,
            });
        }

        res.send({
            input_schema: inputModelName,
            input_version: inputModelVersion,
            output_schema: outputModelName,
            output_version: outputModelVersion,
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
