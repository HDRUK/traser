const express = require('express');
const cacheHandler = require('../middleware/cacheHandler');

const router = express.Router();



router.post('/', async (req, res) => {
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
    const schemas = cache.getSchemas();
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


router.get('/:model', async (req, res) => {

    const model = req.params.model;
  
    //retrieve all allowed schemas 
    const schemas = cacheHandler.getSchemas();

    if(!Object.keys(schemas).includes(model)){
        return res.status(400).json({ 
            error: 'Not a known schema',
            details: model
        })
    }

    console.log(schemas[model]);
    res.send(schemas[model]);


});

module.exports = router;
