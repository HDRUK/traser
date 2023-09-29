const {getFromCacheOrUri} = require('./cacheHandler');

const Ajv = require("ajv").default;
const addFormats = require('ajv-formats').default;

const axios = require('axios');

const schemataUri = 'https://raw.githubusercontent.com/HDRUK/schemata-2/add-pydantic'

const getSchemaUri = (model,version) => {
    return `${schemataUri}/hdr_schemata/models/${model}/${version}/schema.json`
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

const getSchemaFile = async(schemaName,schemaVersion) => {

    const schema_path = `/Users/calum/Software/Gateway2.0/schemata-2/hdr_schemata/models/${schemaName}/${schemaVersion}/schema.json`;
    const schema = require(schema_path);
    //ajv.addSchema(schema_document, `${schemaName}:${schemaVersion}`)
    //const schemaUri = getSchemaUri(schemaName,schemaVersion);
    //const schema = await getFromCacheOrUri(schemaUri,schemaUri);
    //const schema = ajv.getSchema(`${schemaName}:${schemaVersion}`);
    return schema;
}

const getSchemaValidator = async (schemaName, schemaVersion) => {
    const name = `${schemaName}:${schemaVersion}`;

    if (!getSchemaValidator.mutex) {
        getSchemaValidator.mutex = Promise.resolve();
    }
    
    await getSchemaValidator.mutex;

    let validator = ajv.getSchema(name);

    
    if (validator == null) {
        const schema = await getSchemaFile(schemaName, schemaVersion);
        await (getSchemaValidator.mutex = (async () => {
	    try{
		ajv.addSchema(schema, name);
	    }
	    catch(error){
		if(error.message.includes('already exists')){
		    console.log('WARNING::',error.message);
		    validator = ajv.getSchema(name);;
		    return validator;
		}
		else{
		    console.error(error);
		    return null;
		}
	    }
	    validator =  ajv.getSchema(name);
            return validator;
        })());
    }
    
    return validator;
};




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
    getSchemaValidator,
    getAvailableSchemas,
    validateMetadata,
    findMatchingSchemas
};
