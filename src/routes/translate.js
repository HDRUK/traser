const express = require("express");
const {
    translate,
    findModelAndVersion,
    getDefaultModelAndVersion,
} = require("./utils/translate");
// const lodash = require("lodash");
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
            publishMessage(
                "POST",
                "translate",
                `Failed to translate metadata`
            );
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

        if (inputModelName == undefined || inputModelVersion == undefined) {
            const { name, version, error } = await findModelAndVersion(
                metadata,
                selectFirstMatching
            );
            if (error) {
                publishMessage(
                    "POST",
                    "translate",
                    `Failed to translate metadata`
                );
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
                publishMessage(
                    "POST",
                    "translate",
                    `Failed to translate metadata from ${inputModelName}:${inputModelVersion} - output model undefined`
                );
                return res.status(500).json({
                    message: "undefined outputModel!",
                });
            }

            if (error) {
                publishMessage(
                    "POST",
                    "translate",
                    `Failed to translate metadata from ${inputModelName}:${inputModelVersion}`
                );
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
            publishMessage(
                "POST",
                "translate",
                `Failed to translate metadata from ${inputModelName}:${inputModelVersion} - input model unsupported`
            );
            return res.status(400).json({
                message: `Cannot support the input model (${inputModelName}:${inputModelVersion})`,
            });
        }

        if (!outputSupported) {
            publishMessage(
                "POST",
                "translate",
                `Failed to translate metadata from ${inputModelName}:${inputModelVersion} - output model unsupported`
            );
            return res.status(400).json({
                message: `Cannot support the output model (${outputModelName}:${outputModelVersion})`,
            });
        }

        //if asked to validate the input, perform the validation
        // - we have already checked if the schemas (inputModelName) as allowed/valid
        if (validateInput) {
            const resultInputValidation = (subsection === undefined) ? await validateMetadata(
                metadata,
                inputModelName,
                inputModelVersion
            ) : await validateMetadataSection(
                metadata,
                inputModelName,
                inputModelVersion,
                subsection
            );
          
            if (resultInputValidation.length > 0) {
                publishMessage(
                    "POST",
                    "translate",
                    `Failed to validate input metadata as ${inputModelName}:${inputModelVersion}`
                );
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
            publishMessage(
                "POST",
                "translate",
                `Failed to find translation between ${inputModelName}:${inputModelVersion} and ${outputModelName}:${outputModelVersion}`
            );
            return res.status(error.status).json({
                message: error.message,
            });
        }

        let initialItterationMetadata = metadata;

       for (let i = 1; i < translationsToApply.length; i++) {
            const { name: outputModelName, version: outputModelVersion } =
                translationsToApply[i];

            const { name: inputModelName, version: inputModelVersion } =
                translationsToApply[i - 1];

            const { translatedMetadata, error } = await translate(
                initialItterationMetadata,
                extra,
                inputModelName,
                inputModelVersion,
                outputModelName,
                outputModelVersion
            );
            // const clonedTranslated = lodash.cloneDeep(translatedMetadata);
           
            // const validatedClone =  await validateMetadata(
            //     clonedTranslated,
            //     outputModelName,
            //     outputModelVersion
            // )
            // console.log('versions- inputModelName',   inputModelName )
            // console.log('versions- inputModelVersion',   inputModelVersion)
            // console.log('versions- outputModelName',   outputModelName )
            // console.log('versions- outputModelVersion',   outputModelVersion)
            // console.log('validatedClone' + -i, validatedClone)

            // console.log('translateerror',error)

            if (error) {
                publishMessage(
                    "POST",
                    "translate",
                    `Failed to execute translation between ${inputModelName}:${inputModelVersion} and ${outputModelName}:${outputModelVersion}`
                );
                return res.status(error.status).json({
                    message: error.message,
                    details: error.details,
                });
            }
            initialItterationMetadata = translatedMetadata;
        }


        let outputMetadata = initialItterationMetadata;

     
        if (validateOutput) {
            const resultOutputValidation = (subsection === undefined) ? await validateMetadata(
                outputMetadata,
                outputModelName,
                outputModelVersion
            ) : await validateMetadataSection(
                outputMetadata,
                outputModelName,
                outputModelVersion,
                subsection
            );
            if (resultOutputValidation.length > 0) {
                publishMessage(
                    "POST",
                    "translate",
                    `Failed to validate translation between ${inputModelName}:${inputModelVersion} and ${outputModelName}:${outputModelVersion}`
                );
                return res.status(400).json({
                    message: "Output metadata validation failed",
                    details: resultOutputValidation,
                    data: outputMetadata,
                });
            }
        }

        publishMessage(
            "POST",
            "translate",
            `Translated metadata from ${inputModelName}:${inputModelVersion} to ${outputModelName}:${outputModelVersion}`
        );
        return res.send(outputMetadata);
    }
);

module.exports = router;
