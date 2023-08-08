const express = require('express');
const jsonata = require('jsonata');
const cacheHandler = require('../middleware/cacheHandler');

const router = express.Router();

/**
 * @swagger
 * /translate:
 *   post:
 *     summary: Retrieve a list of JSONPlaceholder users
 *     description: Retrieve a list of users from JSONPlaceholder. Can be used to populate a list of fake users when prototyping or testing an API.
*/
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

    let do_input_check = true;
    if("check_input" in queryString){
        do_input_check = queryString["check_input"] == "1";
    }

    let do_output_check = true;
    if("check_output" in queryString){
        do_output_check = queryString["check_output"] == "1";
    }

    //retrieve all allowed schemas 
    const schemas = cacheHandler.getSchemas();
    // key names are the schemas we are going to check
    let schemas_to_check = Object.keys(schemas);


    let input_model_name = null;

    /* bug here... checking schema when from is not set... */

    //if the user has queried a 'from' then we don't need to 
    // check all the different schemas
    if(Object.keys(queryString).includes('from')){
        const schema_name = queryString['from'];
        if (do_input_check){
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
        else{
            input_model_name = schema_name;
            schemas_to_check = [];
        }
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

    //if the skip is checked...need to set input_model_name!
    if(input_model_name == null){
        return res.status(400).json({ 
            error: 'Input not valid against any known schema', 
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

    //this needs to raise some errors if it cant be found
    const template = cacheHandler.getTemplate(output_model_name,input_model_name);

    if (template == null){
        return res.status(400).json({ 
            error: 'Template file is null!', 
            details: `Could not retrieve the template for output:${output_model_name} input:${input_model_name}`
        });
    }

    try{
        const expression = jsonata(template);
        const result = await expression.evaluate(source);
        isValid = output_validator(result);
        if (!isValid & do_output_check) {
            return res.status(400).json({ 
                error: 'Validation failed', 
                details: output_validator.errors,
                data: result
            });
        }
        res.send(result);
    }
    catch (err) { 
        res.status(400).json({
            details: err.message,
            error: "JSONata failure"
        })
    }

});


module.exports = router;
