const express = require('express');
const jsonata = require('jsonata');
const fs = require('fs');

const router = express.Router();


// Path to the template file
const templatePath = './src/templates/test.jsonata';
let templateData;
fs.readFile(templatePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Failed to load the JSONata template:', err);
        return;
    }
    templateData = data;
});


router.get('/', async (req, res) => {
    const expression = jsonata(templateData);
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

module.exports = router;
