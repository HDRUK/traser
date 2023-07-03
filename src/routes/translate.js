const express = require('express');
const jsonata = require('jsonata');

const router = express.Router();

const source = {
    identifier: '<id>',
    summary:{
	doiName: '<doi>',
	title: '<title>',
	abstract: '<ab>'
    }
};


router.get('/', async (req, res) => {
    const expression = jsonata('{"identifier": [identifier, summary.doiName], "name": summary.title, "description": summary.abstract }');
    const result = await expression.evaluate(source); 
    res.send(result);
});

module.exports = router;
