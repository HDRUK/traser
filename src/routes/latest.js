const express = require("express");
const router = express.Router();
const { getAvailableSchemas } = require("../middleware/schemaHandler");

/**
 * @swagger
 * /latest:
 *   get:
 *     summary: Retrieve the latest schema
 *     description: Retrieve the latest HDR schema version.
 *     responses:
 *       200:
 *         description: Successful response with the latest schema information.
 *         content:
 *           application/json:
 *             example:
 *               GWDM_TRASER_IDENT: "gdmv1"
 *               GWDM: "GWDM"
 *               GWDM_CURRENT_VERSION: "1.0"
 *               FORM_HYDRATION_SCHEMA_MODEL: "HDRUK"
 *               FORM_HYDRATION_SCHEMA_LATEST_VERSION: "1.0"
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
router.get("/", async (_req, res) => {
    try {
        const availableSchemas = await getAvailableSchemas();

        res.status(200).json({
            GWDM_TRASER_IDENT: "gdmv1",
            GWDM: "GWDM",
            GWDM_CURRENT_VERSION: availableSchemas.GWDM?.slice(-1)[0] || "2.0",
            FORM_HYDRATION_SCHEMA_MODEL: "HDRUK",
            FORM_HYDRATION_SCHEMA_LATEST_VERSION: availableSchemas.HDRUK?.slice(-1)[0] || "3.0.0"
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to retrieve schema information." });
    }
});

module.exports = router;
