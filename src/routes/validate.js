const express = require("express");
const { validateMetadata } = require("../middleware/schemaHandler");
const {
    body,
    query,
    validationResult,
    matchedData,
} = require("express-validator");
const router = express.Router();

/**
 * @swagger
 * /validate:
 *   post:
 *     summary: Perform a validation of metadata
 *     description: Validates metadata known to TRASER.
 *     parameters:
 *       - in: query
 *         name: input_schema
 *         required: true
 *         schema:
 *           type: string
 *         description: Schema model name
 *         example: GWDM
 *       - in: query
 *         name: input_version
 *         required: true
 *         schema:
 *           type: string
 *         description: Model version to be validated against
 *         example: 1.0 
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
 *                 description: metadata JSON object that is to be validated  
 *     responses:
 *       200:
 *         description: Successful validation of metadata with the requested schema name and version
 *         content:
 *           application/json:
 *            schema:
 *               type: object
 *               properties:
 *                 details:
 *                   type: string
 *               example:
 &                 details: "all ok"
 *       400:
 *         description: Metadata cannot be validated
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

        const metadataValidationResult = await validateMetadata(
            metadata,
            modelName,
            modelVersion
        );
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
