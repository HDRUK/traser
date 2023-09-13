const {redisClient} = require('./cacheHandler');

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
    
    let schema = await redisClient.get(schemaUri);
    if (schema === null) {
	try {
	    // Fetch schema from a remote URL (e.g., GitHub repository).
	    console.log(`Getting ${schemaUri}`);
	    const response = await axios.get(schemaUri);
	    schema = response.data;
	    await redisClient.set(schemaUri, JSON.stringify(schema));
	}
	catch (error) {
	    throw (`Cannot find or retrieve a schema for ${schemaName} (version: ${schemaVersion}) `);
	}
    }
    else{
	schema = JSON.parse(schema);
    }
    return schema;
}

const getAvailableSchemas = async () => {
    let available = await redisClient.get('schemas:available');
    if (available === null){
	const response = await axios.get(schemataUri+'available.json');
	available = response.data;
	redisClient.set('schemas:available',JSON.stringify(available));
    }
    else{
	available = JSON.parse(available);
    }
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


const callGetAvailableSchemas = (value, { req }) => {
  const availableSchemas = await getAvailableSchemas(); 
  if (!availableSchemas.includes(value)) {
      throw new Error(`${value} is not a known schema. Options: ${availableSchemas.join(', ')}`);
  }
    return true;
};

    
module.exports = {
    getSchema,
    getAvailableSchemas,
    callGetAvailableSchemas
};
