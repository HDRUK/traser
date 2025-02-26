const express = require("express");
const router = express.Router();

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
 *               HDRUK: "HDRUK"
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
    res.status(200).json({
        GWDM_TRASER_IDENT: "gdmv1",
        GWDM: "GWDM",
        GWDM_CURRENT_VERSION: "2.0",
        FORM_HYDRATION_SCHEMA_MODEL:"HDRUK",
        FORM_HYDRATION_SCHEMA_LATEST_VERSION:"3.0.0"
    });
});

module.exports = router;
