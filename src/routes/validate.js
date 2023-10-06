const express = require("express");
const {validateMetadata } = require("../middleware/schemaHandler");
const {
    body,
    query,
    validationResult,
    matchedData,
} = require("express-validator");
const router = express.Router();


/**
 * @swagger
 * /translate:
 *   post:
 *     summary: Perform a translation of metadata
 *     description: Translates metadata known to HDRUK from one schema into another with optional input and output validation.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *                 required: true
 *                 description: metadata JSON passed to translation map
 *     responses:
 *       200:
 *         description: Successful validation of metadata into the requested form
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                      type: object
 */
router.post(
    "/",
    [
        body("metadata").isObject().notEmpty().bail(),
        query("input_schema").exists(),
        query("input_version").exists(),
    ],
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({
                message: "Validation has failed",
                errors: result.array(),
            });
        }

        const data = matchedData(req);
        const { metadata } = data;
        const modelName = data.input_schema;
        const modelVersion = data.input_version;

        const metadataValidationResult = await validateMetadata(metadata, modelName, modelVersion);
        if (metadataValidationResult.length > 0) {
            return res.status(400).json({
                error: "metadata validation failed",
                details: metadataValidationResult,
                data: metadata,
            });
        } else {
            return res.send({ details: "all ok" });
        }
    }
);

module.exports = router;
