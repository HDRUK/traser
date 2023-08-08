const express = require('express');
const jsonata = require('jsonata');
const cacheHandler = require('../middleware/cacheHandler');

const router = express.Router();

router.get('/', async (req, res) => {

    const queryString = req.query;
    
    // Define the required query parameters
    const requieredQueries = ['to','from'];
    // check that the queryString contains all these values
    const containsAllValues = requieredQueries.every(
        (v) => Object.keys(queryString).includes(v)
    );
    if (!containsAllValues){ 
        return res.status(400).json({ 
            error: 'Invalid query parameters.',
            required: requieredQueries,
            missing: requieredQueries.filter(
                (v) => !Object.keys(queryString).includes(v)
            )
        });
    }
    const output_model_name = queryString['to'];
    const input_model_name = queryString['from'];

    const template = cacheHandler.getTemplate(output_model_name,input_model_name);
    if (template == null){
        return res.status(400).json({ 
            error: 'Template file is null!', 
            details: `Could not retrieve the template for output:${output_model_name} input:${input_model_name}`
        });
    }

    //const expression = jsonata(template);
    res.send({"template":template});//"expression":expression})

});

router.post('/validate', async (req, res) => {
    const queryString = req.query;
    
    // Define the required query parameters
    const requieredQueries = ['from'];
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
    const schemas = cacheHandler.getSchemas();
    const schema_to_check = queryString['from'];
    //check the specified input model is even known/valid
    if(!Object.keys(schemas).includes(schema_to_check)){
        return res.status(400).json({ 
            error: 'Not a valid schema template for "from".',
            schema_name: schema_to_check,
            allowed_schemas: Object.keys(schemas)
        });
    }
    
    //retrieve the posted data 
    const metadata = req.body;
    
    if (typeof metadata === 'undefined') {
        return res.status(400).json({ 
            error: "metadata not supplied!",
            details: 'You must post data in the form {"metadata":{}}.'
        });
    }

    //for the schema to check, retrieve the validator
    const input_validator =  schemas[schema_to_check].validator;
    //check if the metadata is valid 
    let isValid = input_validator(metadata);

    if (!isValid) {
        res.send({details: input_validator.errors});
    }
    else{
	res.send({details:'all ok'})
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
