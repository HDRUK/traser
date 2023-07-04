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

    let schemas_to_check = Object.keys(schemas);

    if(Object.keys(queryString).includes('from')){
        const schema_name = queryString['from'];

        if(!Object.keys(schemas).includes(schema_name)){
            return res.status(400).json({ 
                error: 'Not a valid schema template for "from".',
                schema_name: schema_name,
                allowed_schemas: schemas_to_check
            });
        }
        schemas_to_check = [schema_name];
    }

    const body = req.body;

    let input_validator;
    const input_validation_errors = {};
    let anyValid = false;


    schemas_to_check.forEach(schema_name => {
        input_validator =  schemas[schema_name].validator;
        let isValid = input_validator(body.metadata);
        if (!isValid) {
            input_validation_errors[schema_name] = 
                { 
                    error: 'Validation failed', 
                    details: input_validator.errors 
                }
            ;
        }
        else{
            //could also break once found a valid schema?
            anyValid = true;
        }
    });
    if(!anyValid){
        return res.status(400).json({ 
            error: 'Validation failed', 
            details: input_validator.errors 
        });
    }

    //now check the output model requested
    const output_model_name = queryString['to'];
    if(!Object.keys(schemas).includes(output_model_name)){
        return res.status(400).json({ 
            error: output_model_name+' is not a valid output model',
            allowedModels: Object.keys(schemas)
        });
    }

    const output_validator = schemas[output_model_name].validator;

    const source = {
        input: body.metadata,
        extra: body.extra //validate this based on the input/output (?)
    }


    const template = config.getTemplates()['hdrukv211'].template;

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
