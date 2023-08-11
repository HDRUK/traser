const Ajv = require("ajv");
const fs = require('fs');
const path = require('path');

const ajv = new Ajv(
    { 
        strict: false,
        strictSchema: false,
        allErrors: false,
        coerceTypes: true
    });



// Function to load template file
function loadTemplate(filePath) {
    const templatePath = path.resolve(filePath);
    return new Promise((resolve, reject) => {
        fs.readFile(templatePath, 'utf8', (err, data) => {
        if (err) {
            reject(err);
        } else {
            resolve(data);
        }
        });
    });
}

let templates = {
    gdmv1: {
        hdrukv211:{
            fpath:'./src/templates/GDMv1/HDRUKv211.jsonata',
            template:null
        },
        schemaorg:{
            fpath:'./src/templates/GDMv1/SchemaOrg.jsonata',
            template:null
        }
    },
    hdrukv211:{
        datasetv2:{
            fpath:'./src/templates/HDRUKv211/datasetv2.jsonata',
            template:null 
        },
	gdmv1:{
            fpath:'./src/templates/HDRUKv211/GDMv1.jsonata',
            template:null 
        }

    },
    schemaorg:{
        gdmv1:{
            fpath:'./src/templates/SchemaOrg/GDMv1.jsonata',
            template:null
        }
    }
    /*gdmv0: {
        test:{
            fpath:'./src/templates/GDMv1/HDRUKv211.jsonata',
            template:null
        }
    }*/
}

//load templates asynchronously
//bit messy? bit of an overkill?
const loadTemplates = async () => {
    const updatedTemplates = {};
    const promises = Object.entries(templates)
    .map(async ([oname, inputs]) => {
        await Promise.all(
            Object.entries(inputs).map( async ([iname,obj]) => {
                return loadTemplate(obj.fpath)
                .then((template) => {
                    if(!Object.keys(updatedTemplates).includes(oname)){
                        updatedTemplates[oname] = {}
                    }
                    updatedTemplates[oname][iname] = { ...obj, template };
                });
            })
        );
    });
    await Promise.all(promises);
    Object.assign(templates, updatedTemplates); 
};


let schemas = {
    hdrukv211:{
        fpath: './src/schemas/hdruk_2_1_1.json',
        validator: null
    },
    gdmv1:{
        fpath: './src/schemas/gdmv1.json',
        validator: null
    },
    schemaorg:{
        //fpath: './src/schemas/schema.org/dataset.json',
        fpath: './src/schemas/schema.org/supermodel.json',
        validator: null
    }
}
const loadSchemas = async () => {
    for (const [key, value] of Object.entries(schemas)) {
        const schemaPath = path.resolve(value.fpath);
	const schema = require(schemaPath);
	schemas[key].schema = schema
        const validator = ajv.compile(schema);
        schemas[key].validator = validator;
	
    }
}

const loadData = async () => {
    loadTemplates();
    loadSchemas();
    //other
}

//catch errors for if not loaded (?)
const getTemplates = () => templates;
const getSchemas = () => schemas;
const getAvailableSchemas = () => Object.keys(schemas);

//update soon with output 
const getTemplate = (output,input) => templates[output][input].template;


const findMatchingSchema = (metadata) => {
    const result = Object.keys(schemas).map(name => {
	//for the schema to check, retrieve the validator
	const input_validator =  schemas[name].validator;
	//check if the metadata is valid 
	let isValid = input_validator(metadata);
	
	const retval = {"name":name,"matches":isValid};
	
	return retval;
    });
    return result;
}



module.exports = {
    loadData,
    getTemplates,
    getTemplate,
    getSchemas,
    getAvailableSchemas,
    findMatchingSchema
};
