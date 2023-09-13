const {redisClient,getFromCacheOrUri} = require('./cacheHandler');

const Ajv = require("ajv").default;
const addFormats = require('ajv-formats').default;

const axios = require('axios');

const schemataUri = 'https://raw.githubusercontent.com/HDRUK/schemata-2/master/'

const getSchemaUri = (model,version) => {
    return `{schemataUri}/${model}/${version}/schema.json`
}

const ajv = new Ajv(
    {
        strict: false,
        strictSchema: false,
	strictTypes:false,
        allErrors: false,
        coerceTypes: true
    });

//needed to remove warnings about dates and date-times
addFormats(ajv);

const getSchema = async(schemaName,schemaVersion) => {
    const schemaUri = getSchemaUri(schemaName,schemaVersion);
    const schema = await getFromCacheOrUri(schemaUri,schemaUri);
    return schema;
}

const getAvailableSchemas = async () => {
    const available = await getFromCacheOrUri('schemas:available',schemataUri+'available.json');
    return available;
};

const validateMetadata = (metadata,modelName) => {
    if(!Object.keys(schemas).includes(modelName)){
	return [{'message':`${modelName} is not a known schema to validate!`}]
    }

    const schema = schemas[modelName];
    const validator = schema.validator;
    if (validator == null){
	return [{'message':`${modelName} schemas file is undefined!`}]
    }
    
    const isValid = validator(metadata);
    if(!isValid){
	return validator.errors;
    }
    else{
	return [];
    }
}


const callGetAvailableSchemas = async (value, { req }) => {
    const availableSchemas = await getAvailableSchemas();
    console.log(availableSchemas);
    console.log(value);
    console.log(req.query);
    /*if (!availableSchemas.includes(value)) {
      throw new Error(`${value} is not a known schema. Options: ${availableSchemas.join(', ')}`);
      }*/
    return false;
    
};

    
module.exports = {
    getSchema,
    getAvailableSchemas,
    callGetAvailableSchemas
};
