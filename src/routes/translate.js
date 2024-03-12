const express = require("express");
const {
    translate,
    findModelAndVersion,
    getDefaultModelAndVersion,
} = require("./utils/translate");

const { TranslationGraph } = require("./utils/graphHelpers");

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
 * /translate:
 *   post:
 *     summary: Perform a translation of metadata
 *     description: Translates metadata known to HDRUK from one schema into another with optional input and output validation.
 *     parameters:
 *       - in: query
 *         name: output_schema
 *         required: false
 *         schema:
 *           type: string
 *         description: Output metadata model name
 *       - in: query
 *         name: output_version
 *         required: false
 *         schema:
 *           type: string
 *         description: Output metadata model version
 *       - in: query
 *         name: input_schema
 *         required: false
 *         schema:
 *           type: string
 *         description: Input metadata model name. If unknown, the route will attempt to determine which schema the metadata matches and use that as the input metadata model name
 *       - in: query
 *         name: input_version
 *         required: false
 *         schema:
 *           type: string
 *         description: Input metadata model version. If unknown, the route will attempt to determine which schema version the metadata matches and use that as the input metadata model version
 *       - in: query
 *         name: validate_input
 *         required: false
 *         schema:
 *           type: string
 *           enum: [0, 1]
 *         description: Whether to validate input metadata (optional, 0[no] or  1[yes])
 *       - in: query
 *         name: validate_output
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: Whether to validate output metadata (optional, 0[no] or  1[yes])
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
 *               extra:
 *                 type: object
 *                 required: false
 *                 description: if additional data needs to be passed to the translation map
 *     responses:
 *       200:
 *         description: Successful translation of metadata into the requested form
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
        body("extra").optional().isObject(),
        query(["validate_input", "validate_output"])
            .default("1")
            .isIn(["0", "1"]) //this seems to work for [0,1] as well
            .customSanitizer((value) => {
                //needed to make sure/force the value to be bool
                // - can be seen if you do console.log(typeof(value))
                return value === "1";
            })
            .withMessage("Needs to be boolean (either 1 or 0)"),
        query("output_schema").optional(),
        query("output_version").optional(),
        query("input_schema").optional(),
        query("input_version").optional(),
        query("select_first_matching").default(true),
    ],
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            return res.status(400).json({
                message: "Translation has failed.",
                errors: result.array(),
            });
        }

        let {
            metadata,
            extra,
            validate_input: validateInput,
            validate_output: validateOutput,
            select_first_matching: selectFirstMatching,
            input_schema: inputModelName,
            input_version: inputModelVersion,
            output_schema: outputModelName,
            output_version: outputModelVersion,
        } = matchedData(req);

        if (inputModelName == undefined || inputModelVersion == undefined) {
            const { name, version, error } = await findModelAndVersion(
                metadata,
                selectFirstMatching
            );
            if (error) {
                return res.status(error.status).json({
                    message: error.message,
                    details: error.details,
                });
            }
            inputModelName = name;
            inputModelVersion = version;
        }

        if (outputModelName == undefined || outputModelVersion == undefined) {
            const { name, version, error } = await getDefaultModelAndVersion(
                outputModelName,
                outputModelVersion
            );

            if (!error && (version == undefined || name == undefined)) {
                return res.status(500).json({
                    message: "undefined outputModel!",
                });
            }

            if (error) {
                return res.status(error.status).json({
                    message: error.message,
                    details: error.details,
                });
            }
            outputModelName = name;
            outputModelVersion = version;
        }

        const templatesGraph = await new TranslationGraph();

        const inputSupported = Object.keys(templatesGraph.nodes).includes(
            `${inputModelName}:${inputModelVersion}`
        );

        const outputSupported = Object.keys(templatesGraph.nodes).includes(
            `${outputModelName}:${outputModelVersion}`
        );

        if (!inputSupported) {
            return res.status(400).json({
                message: `Cannot support the input model (${inputModelName}:${inputModelVersion})`,
            });
        }

        if (!outputSupported) {
            return res.status(400).json({
                message: `Cannot support the output model (${outputModelName}:${outputModelVersion})`,
            });
        }

        //if asked to validate the input, perform the validation
        // - we have already checked if the schemas (inputModelName) as allowed/valid
        if (validateInput) {
            const resultInputValidation = await validateMetadata(
                metadata,
                inputModelName,
                inputModelVersion
            );

            if (resultInputValidation.length > 0) {
                return res.status(400).json({
                    message: "Input metadata validation failed",
                    details: {
                        validationErrors: resultInputValidation,
                        data: metadata,
                    },
                });
            }
        }

        // build a graph of all the available translations

        let startNode = `${inputModelName}:${inputModelVersion}`;
        let endNode = `${outputModelName}:${outputModelVersion}`;

        //find the best route between the translations
        let predecessors = templatesGraph.dijkstra(startNode);
        const { translationsToApply, error } = templatesGraph.getPath(
            startNode,
            endNode,
            predecessors
        );
        if (error) {
            return res.status(error.status).json({
                message: error.message,
            });
        }

        let initialMetadata = metadata;

        for (let i = 1; i < translationsToApply.length; i++) {
            const { name: outputModelName, version: outputModelVersion } =
                translationsToApply[i];

            const { name: inputModelName, version: inputModelVersion } =
                translationsToApply[i - 1];

            const { translatedMetadata, error } = await translate(
                initialMetadata,
                extra,
                inputModelName,
                inputModelVersion,
                outputModelName,
                outputModelVersion
            );

            if (error) {
                return res.status(error.status).json({
                    message: error.message,
                    details: error.details,
                });
            }
            initialMetadata = translatedMetadata;
        }
        let outputMetadata = initialMetadata;

        if (validateOutput) {
            const resultOutputValidation = await validateMetadata(
                outputMetadata,
                outputModelName,
                outputModelVersion
            );
            if (resultOutputValidation.length > 0) {
                return res.status(400).json({
                    message: "Output metadata validation failed",
                    details: resultOutputValidation,
                    data: outputMetadata,
                });
            }
        }

        return res.send(outputMetadata);
    }
);

module.exports = router;
