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



module.exports = router;
