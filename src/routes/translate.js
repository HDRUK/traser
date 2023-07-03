const express = require('express');
const jsonata = require('jsonata');
const Ajv = require("ajv");
const path = require('path');
const ajv = new Ajv({ strict: false });
const fs = require('fs');

const router = express.Router();


// Path to the template file
const templatePath = './src/templates/test.jsonata';
let templateData = {GDMv1:{}};
fs.readFile(templatePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Failed to load the JSONata template:', err);
        return;
    }
    templateData['test'] = data;
});

fs.readFile('./src/templates/GDMv1/HDRUKv211.jsonata', 'utf8', (err, data) => {
    if (err) {
        console.error('Failed to load the JSONata template:', err);
        return;
    }
    templateData.GDMv1.HDRUKv211 = data;
});


const schemaPath = path.resolve('./src/schemas/hdruk_2_1_1.json');
console.log(schemaPath);
const validate_hdruk211 = ajv.compile(require(schemaPath));


router.post('/', async (req, res) => {
    const body = req.body;

    const isValid = validate_hdruk211(body.metadata);

    if (!isValid) {
        return res.status(400).json({ 
            error: 'Validation failed', 
            details: validate_hdruk211.errors 
        });
    }

    const source = {
        input: body.metadata,
        extra: body.extra
    }

    try{
        const expression = jsonata(templateData.GDMv1.HDRUKv211);
        const result = await expression.evaluate(source);
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
