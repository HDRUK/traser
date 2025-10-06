const express = require("express");
const {
    translate,
    findModelAndVersion,
    getDefaultModelAndVersion,
} = require("./utils/translate");

const { TranslationGraph } = require("./utils/graphHelpers");

const publishMessage = require("../middleware/auditHandler");
const { validateMetadata, validateMetadataSection } = require("../middleware/schemaHandler");

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
 *       - in: query
 *         name: subsection
 *         required: false
 *         schema:
 *           type: string
 *         description: Subsection of the schema to translate. Only that section will be validated and returned if translation is successful
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
        query("subsection").optional(),
        query("select_first_matching").default(true),
    ],
    async (req, res) => {
        const result = validationResult(req);
        if (!result.isEmpty()) {
            publishMessage("POST", "translate", `Failed to translate metadata`);
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
            subsection: subsection,
        } = matchedData(req);

        try {

            if (inputModelName == undefined || inputModelVersion == undefined) {
                const { name, version, error } = await findModelAndVersion(metadata, selectFirstMatching, true);
                if (error) throw error;
                inputModelName = name;
                inputModelVersion = version;
            }


            if (outputModelName == undefined || outputModelVersion == undefined) {
                const { name, version, error } = await getDefaultModelAndVersion(outputModelName, outputModelVersion);
                if (error) throw error;
                outputModelName = name;
                outputModelVersion = version;
            }

            const templatesGraph = await new TranslationGraph();


            const inputSupported = templatesGraph.nodes.hasOwnProperty(`${inputModelName}:${inputModelVersion}`);
            const outputSupported = templatesGraph.nodes.hasOwnProperty(`${outputModelName}:${outputModelVersion}`);

            if (!inputSupported) {
                throw { status: 400, message: `Cannot support the input model (${inputModelName}:${inputModelVersion})` };
            }

            if (!outputSupported) {
                throw { status: 400, message: `Cannot support the output model (${outputModelName}:${outputModelVersion})` };
            }

            if (validateInput) {
                const validationFn = subsection === undefined ? validateMetadata : validateMetadataSection;
                const resultInputValidation = await validationFn(metadata, inputModelName, inputModelVersion, subsection);

                if (resultInputValidation.length > 0) {
                    throw {
                        status: 400,
                        message: "Input metadata validation failed",
                        details: { validationErrors: resultInputValidation, data: metadata },
                    };
                }
            }


            const startNode = `${inputModelName}:${inputModelVersion}`;
            const endNode = `${outputModelName}:${outputModelVersion}`;
            const predecessors = templatesGraph.dijkstra(startNode);
            const { translationsToApply, error } = templatesGraph.getPath(startNode, endNode, predecessors);

            if (error) {
                throw { status: 500, message: `Failed to find translation between ${inputModelName}:${inputModelVersion} and ${outputModelName}:${outputModelVersion}` };
            }

            let initialItterationMetadata = metadata;

            for (let i = 1; i < translationsToApply.length; i++) {
                const { name: outputModelName, version: outputModelVersion } = translationsToApply[i];
                const { name: inputModelName, version: inputModelVersion } = translationsToApply[i - 1];

                const { translatedMetadata, error } = await translate(
                    initialItterationMetadata,
                    extra,
                    inputModelName,
                    inputModelVersion,
                    outputModelName,
                    outputModelVersion
                );

                if (error) {
                    throw { status: 500, message: `Failed to execute translation between ${inputModelName}:${inputModelVersion} and ${outputModelName}:${outputModelVersion}` };
                }
                initialItterationMetadata = translatedMetadata;
            }

            let outputMetadata = initialItterationMetadata;

            if (validateOutput) {
                const validationFn = subsection === undefined ? validateMetadata : validateMetadataSection;
                const resultOutputValidation = await validationFn(outputMetadata, outputModelName, outputModelVersion, subsection);
                if (resultOutputValidation.length > 0) {
                    throw {
                        status: 400,
                        message: "Output metadata validation failed",
                        details: resultOutputValidation,
                        data: outputMetadata,
                    };
                }
            }

            publishMessage("POST", "translate", `Translated metadata from ${inputModelName}:${inputModelVersion} to ${outputModelName}:${outputModelVersion}`);
            return res.send(outputMetadata);
        } catch (err) {
            publishMessage("POST", "translate", `Failed to translate metadata`);
            return res.status(err.status || 500).json({
                message: err.message,
                details: err.details || {},
            });
        }
    }
);

module.exports = router;
