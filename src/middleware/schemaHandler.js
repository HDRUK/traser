const {
    getFromUri,
    getFromCacheOrUri,
    getFromLocal,
    getFromCacheOrLocal,
} = require("./cacheHandler");

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

const schemataPath = process.env.SCHEMA_LOCATION;
const loadFromLocalFile = !schemataPath.startsWith("http");

const getFromCacheOrOther = loadFromLocalFile
    ? getFromCacheOrLocal
    : getFromCacheOrUri;
const getFromOther = loadFromLocalFile ? getFromLocal : getFromUri;

const getSchemaPath = (model, version) => {
    return `${schemataPath}/hdr_schemata/models/${model}/${version}/schema.json`;
};

const retrieveSchema = async (schemaName, schemaVersion) => {
    const schemaPath = getSchemaPath(schemaName, schemaVersion);
    let schema = await getFromOther(schemaPath, schemaPath);
    if (typeof schema === "string") {
        schema = JSON.parse(schema);
    }
    return schema;
};

const getAvailableSchemas = async () => {
    let available = await getFromCacheOrOther(
        "schemas:available",
        schemataPath + "/available.json"
    );
    if (typeof available === "string") {
        available = JSON.parse(available);
    }
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

const findMatchingSchemas = async (metadata, with_errors = false) => {
    const schemas = await getAvailableSchemas();
    let retval = [];
    for (const [schema, versions] of Object.entries(schemas)) {
        for (const version of versions) {
            try {
                const validator = await getSchema(schema, version);
                //need to do a shallowcopy of the metadata as ajv is configured
                // to fill missing data
                const isValid = validator({ ...metadata });
                const outcome = {
                    name: schema,
                    version: version,
                    matches: isValid,
                };
                if (with_errors) {
                    outcome.errors = validator.errors;
                }
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
            await ajv.removeSchema(key);
            ajv.addSchema(schema, key);
        }
    }
};

module.exports = {
    ajv,
    loadSchemas,
    getSchema,
    getAvailableSchemas,
    validateMetadata,
    findMatchingSchemas,
};
