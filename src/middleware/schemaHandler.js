const { 
    getFromCache, 
    getFromCacheOrUri, 
    getFromCacheOrLocal, 
    saveToCache 
} = require("./cacheHandler");
const lodash = require("lodash");

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


const getSchemaPath = (model, version) =>
    `${schemataPath}/hdr_schemata/models/${model}/${version}/schema.json`;

const getHydrationSchemaPath = (model, version) =>
    `${schemataPath}/docs/${model}/${version}.form.json`;

const retrieveSchema = async (schemaName, schemaVersion) => {
    const cacheKey = `${schemaName}:${schemaVersion}`;
    let schema = getFromCache(cacheKey);

    if (schema) {
        return schema;
    }

   
    const schemaPath = getSchemaPath(schemaName, schemaVersion);


    schema = loadFromLocalFile
        ? await getFromCacheOrLocal(cacheKey, schemaPath)
        : await getFromCacheOrUri(cacheKey, schemaPath);

    if (!schema) {
        throw new Error(`Schema not found: ${schemaPath}`);
    }

    if (typeof schema === "string") {
        schema = JSON.parse(schema);
    }

    saveToCache(cacheKey, schema);
    return schema;
};


const retrieveHydrationSchema = async (model, version) => {
    const cacheKey = `hydration:${model}:${version}`;
    let schema = getFromCache(cacheKey);
    
    if (!schema) {
        const schemaPath = getHydrationSchemaPath(model, version);
        schema = loadFromLocalFile
            ? await getFromCacheOrLocal(cacheKey, schemaPath)
            : await getFromCacheOrUri(cacheKey, schemaPath);

        if (!schema) {
            throw new Error(`Hydration schema not found: ${schemaPath}`);
        }

        if (typeof schema === "string") {
            schema = JSON.parse(schema);
        }

        saveToCache(cacheKey, schema);
    }
    
    return schema;
};


const getAvailableSchemas = async () => {
    const cacheKey = 'schemas:available';
    let available = getFromCache(cacheKey);
    
    if (!available) {
        available = await getFromCacheOrUri(cacheKey, `${schemataPath}/available.json`);
        
        if (!available) {
            throw new Error("Failed to fetch available schemas.");
        }

        if (typeof available === "string") {
            available = JSON.parse(available);
        }

        saveToCache(cacheKey, available);
    }

    return available;
};

const getSchema = async (schemaName, schemaVersion) => {
    return ajv.getSchema(`${schemaName}:${schemaVersion}`);
};

const validateMetadata = async (metadata, modelName, modelVersion) => {
    const validator = await getSchema(modelName, modelVersion);
    if (!validator) {
        return [{ message: `Schema for model=${modelName} version=${modelVersion} is not known!` }];
    }

    const isValid = validator(metadata);
    return isValid ? [] : validator.errors;
};


const validateMetadataSection = async (metadata, modelName, modelVersion, subsection) => {
    const schemaRef = `${modelName}:${modelVersion}#/properties/${subsection}`;
    const validator = ajv.getSchema(schemaRef);

    if (!validator) {
        return [{ message: `Schema for model=${modelName} version=${modelVersion} subsection=${subsection} is not known!` }];
    }

    const metadataSubsection = metadata[subsection];
    if (!metadataSubsection) {
        return [{ message: `Subsection ${subsection} not found in provided metadata.` }];
    }

    const isValid = validator(metadataSubsection);
    return isValid ? [] : validator.errors;
};

const findMatchingSchemas = async (metadata, withErrors = false) => {
   const schemas = await getAvailableSchemas();
    let matches = [];
    const metadataClone = lodash.cloneDeep(metadata);
    Object.freeze(metadataClone);

    for (const [schema, versions] of Object.entries(schemas)) {
        for (const version of versions) {
            try {
                const validator = await getSchema(schema, version);
                if (!validator) continue;

                const isValid = validator({...metadataClone});
                const result = { name: schema, version, matches: isValid };
                if (withErrors) {
                    result.errors = validator.errors;
                }

                matches.push(result);
            } catch (error) {
                console.error(`Error validating ${schema}:${version}`, error);
            }
        }
    }

    return matches;
};

const loadSchemas = async () => {
    const schemas = await getAvailableSchemas();

    for (const [schemaName, schemaVersions] of Object.entries(schemas)) {
        for (const schemaVersion of schemaVersions) {
            try {
                const schema = await retrieveSchema(schemaName, schemaVersion);
                const key = `${schemaName}:${schemaVersion}`;
                //use ajv as the cache for the schema
                ajv.removeSchema(key);
                ajv.addSchema(schema, key);
            } catch (error) {
                console.error(`Failed to load schema ${schemaName}:${schemaVersion}`, error);
            }
        }
    }
};

module.exports = {
    ajv,
    loadSchemas,
    getSchema,
    getAvailableSchemas,
    validateMetadata,
    validateMetadataSection,
    findMatchingSchemas,
    retrieveHydrationSchema,
};
