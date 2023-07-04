const express = require('express');
const jsonata = require('jsonata');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const Ajv = require("ajv");
const ajv = new Ajv({ strict: false });


const router = express.Router();

// Load files using the config module
config.loadData();


router.post('/', async (req, res) => {

    const queryString = req.query;
    
    // Define the required query parameters
    const requieredQueries = ['to'];
    // check that the queryString contains all these values
    const containsAllValues = requieredQueries.every(
        (v) => Object.keys(queryString).includes(v)
    );
    // Check if not, raise an error
    if (!containsAllValues){ 
        return res.status(400).json({ 
            error: 'Invalid query parameters.',
            required: requieredQueries,
            missing: requieredQueries.filter(
                (v) => !Object.keys(queryString).includes(v)
            )
        });
    }

    //retrieve all allowed schemas 
    const schemas = config.getSchemas();
    // key names are the schemas we are going to check
    let schemas_to_check = Object.keys(schemas);

    //if the user has queried a 'from' then we don't need to 
    // check all the different schemas
    if(Object.keys(queryString).includes('from')){
        const schema_name = queryString['from'];
        //check the specified input model is even known/valid
        if(!Object.keys(schemas).includes(schema_name)){
            return res.status(400).json({ 
                error: 'Not a valid schema template for "from".',
                schema_name: schema_name,
                allowed_schemas: schemas_to_check
            });
        }
        //if it is valid, then only need to check against this one schema
        schemas_to_check = [schema_name];
    }

    //retrieve the posted data 
    const {extra,metadata} = req.body;

    if (typeof metadata === 'undefined') {
        return res.status(400).json({ 
            error: "metadata not supplied!",
            details: 'You must post data in the form {"metadata":{}}.'
        });
    }

    //record validation errors and if any schemas are valid
    const input_validation_errors = {};
    let input_model_name = null;

    //loop over all schemas to check the input data against
    schemas_to_check.forEach(schema_name => {
        //for the schema to check, retrieve the validator
        const input_validator =  schemas[schema_name].validator;
        //check if the metadata is valid 
        let isValid = input_validator(metadata);
        //if its not, record the details of why not.. 
        if (!isValid) {
            input_validation_errors[schema_name] = 
                { 
                    details: input_validator.errors 
                }
            ;
        }
        else{
            input_model_name = schema_name;
            return;
        }
    });

    //return errors if the metadata doesnt validate against any
    // known metadata schemas
    if(input_model_name == null){
        return res.status(400).json({ 
            error: 'Not valid against any known schema', 
            schemas: input_validation_errors
        });
    }

    //now check the output model requested is valid...
    const output_model_name = queryString['to'];
    if(!Object.keys(schemas).includes(output_model_name)){
        return res.status(400).json({ 
            error: output_model_name+' is not a valid output model',
            allowedModels: Object.keys(schemas)
        });
    }
    // load the validator for the output data
    const output_validator = schemas[output_model_name].validator;

    //create an object for the template to use
    const source = {
        input: metadata,
        extra: extra //validate this based on the input/output (?)
    }

    const template = config.getTemplate(input_model_name);

    try{
        const expression = jsonata(template);
        const result = await expression.evaluate(source);
        isValid = output_validator(result);
        if (!isValid) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: output_validator.errors 
            });
        }
        res.send(result);
    }
    catch (err) { 
        res.send({
            details: err.message,
            error: "JSONata failure"
        })
    }

});



router.get('/test', async (req, res) => {
    const expression = jsonata(templateData['test']);
    const source = {
        identifier: '<id>',
        summary: {
            doiName: '<doi>',
            title: '<title>',
            abstract: '<ab>',
        }
    };
    const result = await expression.evaluate(source);
    res.send(result);
});


//


module.exports = router;
