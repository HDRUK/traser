const {redisClient,getFromCacheOrUri} = require('./cacheHandler');

const Ajv = require("ajv").default;
const addFormats = require('ajv-formats').default;

const axios = require('axios');

const schemataUri = 'https://raw.githubusercontent.com/HDRUK/schemata-2/master'

const getSchemaUri = (model,version) => {
    return `${schemataUri}/metadata/${model}/${version}/schema.json`
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

const getSchemaValidator = async(schemaName,schemaVersion) => {
    const name = `${schemaName}:${schemaVersion}`
    let validator = ajv.getSchema(name);
    if(validator == null){
	const schema = await getSchema(schemaName,schemaVersion);
	ajv.addSchema(schema, name);
	validator = ajv.getSchema(name);
    }
    return validator;
}

const getAvailableSchemas = async () => {
    const available = await getFromCacheOrUri('schemas:available',schemataUri+'/available.json');
    return available;
};

const validateMetadata = async (metadata,modelName,modelVersion) => {
    const validator = await getSchemaValidator(modelName,modelVersion);
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

const findMatchingSchemas = async(metadata) => {
    const schemas = await getAvailableSchemas();
    let retval = [];
    for (const [schema, versions] of Object.entries(schemas)) {
	for( const version of versions){

	    try{
		const validator = await getSchemaValidator(schema,version);
		const isValid = validator(metadata);
		const outcome = {"name":schema,"version":version,"matches":isValid};
		retval.push(outcome);
	    }
	    catch(error){
		console.log(error);
	    }

	}
    }
    return retval;
}

module.exports = {
    ajv,
    getSchema,
    getSchemaValidator,
    getAvailableSchemas,
    validateMetadata,
    findMatchingSchemas
};
