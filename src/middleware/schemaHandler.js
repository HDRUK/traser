const NodeCache = require( "node-cache" );
const schemaCache = new NodeCache({ stdTTL: 100, checkperiod: 120 });

const Ajv = require("ajv").default;
const addFormats = require('ajv-formats').default;

const axios = require('axios');

let schemaLocations = {
    //hdrukv211: 'https://raw.githubusercontent.com/HDRUK/schemata-2/master/metadata/hdruk/2.1.1/schema.json',
    hdrukv212: 'https://raw.githubusercontent.com/HDRUK/schemata-2/master/metadata/hdruk/2.1.2/schema.json',
    gdmv1: 'https://raw.githubusercontent.com/HDRUK/schemata-2/master/metadata/gwdm/1.0/schema.json',
    //schemaorg: 'https://raw.githubusercontent.com/HDRUK/schemata-2/master/metadata/schema.org/supermodel.json'
}

async function fetchAndCacheSchema(schemaName, schemaUrl) {
    let schema = schemaCache.get(schemaName);
    if (!schema) {
	try {
	    if (schemaUrl.startsWith('http')) {
		// Fetch schema from a remote URL (e.g., GitHub repository).
		const response = await axios.get(schemaUrl);
		schema = response.data;
	    }
	    else {
		console.error('something wrong... need to fetch schema from uri');
	    }
	    schemaCache.set(schemaName, schema);
	}
	catch (error) {
	    console.error(`Error fetching or reading ${schemaName}: ${error.message}`);
	}
    }
    return true;
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

const getSchema = async(schemaName) => {
    const schemaUri = schemaLocations[schemaName];
    let schema = schemaCache.get(schemaName);
    if (!schema) {
	try {
	    if (schemaUri.startsWith('http')) {
		// Fetch schema from a remote URL (e.g., GitHub repository).
		console.log(`Getting ${schemaUri}`);
		const response = await axios.get(schemaUri);
		schema = response.data;
	    }
	    else {
		console.error('something wrong... need to fetch schema from uri');
	    }
	    schemaCache.set(schemaName, schema);
	}
	catch (error) {
	    console.error(`Error fetching or reading ${schemaName}: ${error.message}`);
	}
    }
    else{
	console.log(`already got ${schemaUri}`);
    }
    return schema;
}

const getAvailableSchemas = () => {
    return schemaCache.keys();
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


    
module.exports = {
    getSchema,
    getAvailableSchemas
};
