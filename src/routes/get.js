const express = require("express");
const publishMessage = require("../middleware/auditHandler");
const {
  getSchema,
  getAvailableSchemas,
  retrieveHydrationSchema,
} = require("../middleware/schemaHandler");
const {
  getTemplate,
  getFormHydrationTemplate,
} = require("../middleware/templateHandler");
const { getLatestVersion } = require("../utils/schema");
const { query, validationResult, matchedData } = require("express-validator");
const { hydrate } = require("./utils/hydrate");
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
      publishMessage(
        "GET",
        "map",
        `Failed to retrieve mapping due to invalid inputs`
      );
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
      publishMessage(
        "GET",
        "map",
        `Failed to retrieve mapping for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion}`
      );
      return res.status(400).json({
        error: "Translation not found",
        message: error.message,
        details: `Translation for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion} is not implemented`,
      });
    }

    publishMessage(
      "GET",
      "map",
      `Mapping for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion} retrieved`
    );

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
          if (validator.schema) {
            publishMessage(
              "GET",
              "schema",
              `${schemaModelName}-${schemaModelVersion} retrieved`
            );
            res.send({
              name: schemaModelName,
              version: schemaModelVersion,
              schema: validator.schema,
            });
          }
        })
        .catch((error) => {
          publishMessage(
            "GET",
            "schema",
            `Failed to retrieve ${schemaModelName}-${schemaModelVersion}`
          );
          res.status(400).json({
            error: error.message,
          });
        });
    } catch (error) {
      publishMessage(
        "GET",
        "schema",
        `Failed to retrieve ${schemaModelName}-${schemaModelVersion}`
      );
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

/**
 * @swagger
 * /get/form_hydration:
 *   get:
 *     summary: Retrieve a hydrated form template
 *     description: Retrieve a hydrated form template for Gateway usage
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Model name
 *       - in: query
 *         name: version
 *         required: false
 *         schema:
 *           type: string
 *         description: Model version
 *       - in: query
 *         name: dataTypes
 *         schema:
 *           type: string
 *         description: The optional data types to retrieve schema sections for
 *     responses:
 *       200:
 *         description: Hydrated template retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metadata:
 *                   type: object
 *                   description: The retrieved hydrated template.
 */
router.get(
  "/form_hydration",
  [
    query("name").notEmpty().escape(),
    query("version").optional(),
    query("dataTypes").optional(),
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
    const hydrationModelName = queryString["name"];
    const hydrationModelVersion =
      queryString["version"] || process.env.HYDRATION_MAP_VERSION; // Default to the only one we have
    const dataTypes = queryString["dataTypes"] || "";

    try {
      const metadata = await hydrate(
        hydrationModelName,
        hydrationModelVersion,
        dataTypes
      );

      if (metadata.translatedMetadata) {
        publishMessage(
          "GET",
          "hydration",
          `${hydrationModelName}-${hydrationModelVersion} retrieved`
        );
        return res.status(200).json(metadata.translatedMetadata);
      }

      publishMessage(
        "GET",
        "hydration",
        `${hydrationModelName}-${hydrationModelVersion} failed to hydrate`
      );
      return res.status(400).json({
        message: "Hydration failed.",
      });
    } catch (error) {
      publishMessage(
        "GET",
        "hydration",
        `Failed to retrieve ${hydrationModelName}-${hydrationModelVersion}`
      );
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

router.get("/latest", async (req, res) => {
  const available = await getAvailableSchemas();

  const latestVersions = Object.fromEntries(
    Object.entries(available).map(([schema, versions]) => [
        schema,
        getLatestVersion(versions)
    ])
);

  return res.status(200).json(latestVersions);
});

module.exports = router;
