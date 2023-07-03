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
    const body = req.body;

    const input_validator = config.getSchemas()['hdrukv211'].validator;

    let isValid = input_validator(body.metadata);
    if (!isValid) {
        return res.status(400).json({ 
            error: 'Validation failed', 
            details: input_validator.errors 
        });
    }

    const source = {
        input: body.metadata,
        extra: body.extra
    }

    const output_validator = config.getSchemas()['gdmv1'].validator;

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
        res.send(err)
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
