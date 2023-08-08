const express = require('express');
const jsonata = require('jsonata');
const cacheHandler = require('../middleware/cacheHandler');

const { query, validationResult, matchedData } = require('express-validator');

const router = express.Router();

/**
 * @swagger
 * /get/map:
 *   get:
 *     summary: Retrieve a template or mapping file
 *     description: Retrieve a template or mapping file from the cacheHandler.
 *     parameters:
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *         description: The output schema name.
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         description: The input schema name.
 *     responses:
 *       200:
 *         description: Template or mapping retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mapping:
 *                   type: object
 *                   description: The retrieved template or mapping.
 */
router.get('/map',
    [
        query('to').notEmpty().escape(),
        query('from').notEmpty().escape(),
    ],
    async (req, res) => {

	const result = validationResult(req);
	if (!result.isEmpty()) {
	    return res.status(400).json({ 
		message: 'Invalid query parameters.',
		errors: result.array()
	    });
	}

	const queryString = matchedData(req);
	const output_model_name = queryString['to'];
	const input_model_name = queryString['from'];
	
	const template = cacheHandler.getTemplate(output_model_name,input_model_name);
	if (template == null){
	    return res.status(400).json({ 
		error: 'Template file is null!', 
		details: `Could not retrieve the template for output:${output_model_name} input:${input_model_name}`
	    });
	}
	
	res.send({
	    "from":input_model_name,
	    "to":output_model_name,
	    "translation_map":template
	});

    });



module.exports = router;
