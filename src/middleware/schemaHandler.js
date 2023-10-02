const { getFromCacheOrUri, getFromUri } = require("./cacheHandler");

const axios = require("axios");
const Ajv = require("ajv").default;
const addFormats = require("ajv-formats").default;

const ajv = new Ajv({
    strict: false,
    strictSchema: false,
    strictTypes: false,
    allErrors: false,
    coerceTypes: true,
    useDefaults: true,
});

//needed to remove warnings about dates and date-times
addFormats(ajv);

const schemataUri = "https://raw.githubusercontent.com/HDRUK/schemata-2/master";

const getSchemaUri = (model, version) => {
    return `${schemataUri}/hdr_schemata/models/${model}/${version}/schema.json`;
};

const retrieveSchema = async (schemaName, schemaVersion) => {
    const schemaUri = getSchemaUri(schemaName, schemaVersion);
    const schema = await getFromUri(schemaUri, schemaUri);
    return schema;
};

const getAvailableSchemas = async () => {
    const available = await getFromCacheOrUri(
        "schemas:available",
        schemataUri + "/available.json"
    );
    return available;
};

const getSchema = async (schemaName, schemaVersion) => {
    const name = `${schemaName}:${schemaVersion}`;
    let validator = ajv.getSchema(name);
    return validator;
};

const validateMetadata = async (metadata, modelName, modelVersion) => {
    const validator = await getSchema(modelName, modelVersion);
    if (validator == null) {
        return [
            {
                message: `Schema for model=${modelName} version=${modelVersion} is not known!`,
            },
        ];
    }
    const isValid = validator(metadata);
    if (!isValid) {
        return validator.errors;
    } else {
        return [];
    }
};

const findMatchingSchemas = async (metadata) => {
    const schemas = await getAvailableSchemas();
    let retval = [];
    for (const [schema, versions] of Object.entries(schemas)) {
        for (const version of versions) {
            try {
                const validator = await getSchemaValidator(schema, version);
                const isValid = validator(metadata);
                const outcome = {
                    name: schema,
                    version: version,
                    matches: isValid,
                };
                retval.push(outcome);
            } catch (error) {
                console.log(error);
            }
        }
    }
    return retval;
};

const loadSchemas = async () => {
    const schemas = await getAvailableSchemas();
    for (const [schemaName, schemaVersions] of Object.entries(schemas)) {
        for (const schemaVersion of schemaVersions) {
            const schema = await retrieveSchema(schemaName, schemaVersion);
            const key = `${schemaName}:${schemaVersion}`;
            //use ajv as the cache for the schema
            ajv.removeSchema(key);
            ajv.addSchema(schema, key);
        }
    }
    return true;
};

module.exports = {
    ajv,
    loadSchemas,
    getSchema,
    getAvailableSchemas,
    validateMetadata,
    findMatchingSchemas,
};
