const express = require("express");
const jsonata = require("jsonata");
const { getAvailableTemplates } = require("../middleware/templateHandler");
const { getAvailableSchemas } = require("../middleware/schemaHandler");

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
    res.send(schemas);
});

module.exports = router;
