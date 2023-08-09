const express = require('express');
const jsonata = require('jsonata');
const cacheHandler = require('../middleware/cacheHandler');
const { body, query, validationResult, matchedData } = require('express-validator');
const router = express.Router();

/**
 * @swagger
 * /translate:
 *   post:
 *     summary: Perform a data translation with validation
 *     description: Translate data from one schema to another with optional input and output validation.
 *     parameters:
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *         description: Target schema name
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *         description: Source schema name
 *       - in: query
 *         name: validate_input
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: Whether to validate input metadata (0: no, 1: yes)
 *       - in: query
 *         name: validate_output
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: Whether to validate output metadata (0: no, 1: yes)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *               extra:
 *                 type: object
 *     responses:
 *       200:
 *         description: Successful translation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 // Define properties of the response JSON structure
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     // Define properties of the error object
 */
router.post(
    '/',
    [
	body('metadata')
	    .isObject()
	    .notEmpty()
	    .bail(),
	body('extra')
	    .optional()
	    .isObject(),
	query(['validate_input','validate_output'])
	    .optional()
	    .isIn([0,1])
	    .customSanitizer(value => {
		return value === "1"
	    })
	    .withMessage("Needs to be boolean (either 1 or 0)"),
	query(['to','from'])
	    .exists()
	    .bail()
	    .isIn(cacheHandler.getAvailableSchemas())
	    .withMessage("Not a known schema. Options: "+cacheHandler.getAvailableSchemas())
    ],
    async (req, res) => {	
	const result = validationResult(req);
	if (!result.isEmpty()) {
	    return res.status(400).json({ 
		message: 'Invalid query parameters.',
		errors: result.array()
	    });
	}

	const data = matchedData(req);
	const {metadata,extra,validate_input,validate_output} = data;
	const input_model_name = data.from;
	const output_model_name = data.to;
	
	let template;
	try{
	    template = cacheHandler.getTemplate(output_model_name,input_model_name);
	}
	catch(error){
	    return res.status(400).json({
		error: 'Translation not found',
		details:`Translation for ${input_model_name} to ${output_model_name} is not implemented`
	    });				
	}
	
	if (template === null){
	    return res.status(400).json({
		error: 'Translation not found',
		details:`Failed to load translation map for ${fromValue} to ${toValue}`
	    });
	}
		
	//retrieve all allowed schemas 
	const schemas = cacheHandler.getSchemas();

	//if asked to 
	if(validate_input){
            const input_validator =  schemas[input_model_name].validator;
            const isInputValid = input_validator(metadata);
            if (!isInputValid) {
		return res.status(400).json({ 
                    error: 'Input metadata validation failed', 
                    details: input_validator.errors,
                    data: result
		});
	    }
        }
        
	//create an object to be used within JSONata
	//note:
	// - might want to revisit calling this 'input'?
	// - using 'input' as this is used in the templates
	const source = {
            input: metadata,
            extra: extra 
	}

	//note: could move to a .then() / .catch() on the .evaluate()
	try{ 
            const expression = jsonata(template);
            const result = await expression.evaluate(source);
	    if(validate_output){//note: could be repeating code (?)
		const output_validator = schemas[output_model_name].validator;
		const isOutputValid = output_validator(result);
		if (!isOutputValid) {
		    return res.status(400).json({ 
			error: 'Output metadata validation failed', 
			details: output_validator.errors,
			data: result
		    });
		}
	    }
            res.send(result);
	}
	catch (err) { 
            return res.status(400).json({
		details: err.message,
		error: "JSONata failure"
            })
	}

});


module.exports = router;
