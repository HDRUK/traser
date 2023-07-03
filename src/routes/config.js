const Ajv = require("ajv");
const fs = require('fs');
const path = require('path');


const ajv = new Ajv({ strict: false });
// Initialize AJV instance
const schemaCache = {};

// Function to load JSON schemas
function loadSchema(filePath) {
  const schemaPath = path.resolve(filePath);
  if (!schemaCache[schemaPath]) {
    schemaCache[schemaPath] = ajv.compile(require(schemaPath));
  }
  return schemaCache[schemaPath];
}

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
    test: {
        fpath:'./src/templates/test.jsonata',
        template:null
    },
    hdrukv211:{
        fpath:'./src/templates/GDMv1/HDRUKv211.jsonata',
        template:null
    }
}



const loadTemplates = async () => {
    const updatedTemplates = {};
    const promises = Object.entries(templates).map(([key, value]) => {
        return loadTemplate(value.fpath)
        .then((template) => {
            updatedTemplates[key] = { ...value, template };
        });
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
    }
}
const loadSchemas = async () => {
    for (const [key, value] of Object.entries(schemas)) {
        const schemaPath = path.resolve(value.fpath);
        const validator = ajv.compile(require(schemaPath));
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

module.exports = {
    loadData,
    getTemplates,
    getSchemas,
};
