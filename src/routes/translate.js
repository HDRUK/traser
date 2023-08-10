const express = require('express');
const jsonata = require('jsonata');
const cacheHandler = require('../middleware/cacheHandler');
const { body, query, validationResult, matchedData } = require('express-validator');

const {validateMetadata} = require('./validate');
const router = express.Router();

/**
 * @swagger
 * /translate:
 *   post:
 *     summary: Perform a translation of metadata
 *     description: Translates metadata known to HDRUK from one schema into another with optional input and output validation.
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
 *           type: string
 *           enum: [0, 1]
 *         description: Whether to validate input metadata (optional, 0[no] or  1[yes])
 *       - in: query
 *         name: validate_output
 *         required: false
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *         description: Whether to validate output metadata (optional, 0[no] or  1[yes]) 
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *                 required: true
 *                 description: metadata JSON passed to translation map
 *               extra:
 *                 type: object
 *                 required: false
 *                 description: if additional data needs to be passed to the translation map
 *     responses:
 *       200:
 *         description: Successful translation of metadata into the requested form
 *         content:
 *           application/json:
 *             schema:
 *               type: object
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
 *                      type: object
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
	    .isIn(["0","1"])//this seems to work for [0,1] as well
	    .customSanitizer(value => {
		//needed to make sure/force the value to be bool
		// - can be seen if you do console.log(typeof(value))
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

	//return errors from express-validator 
	const result = validationResult(req);
	if (!result.isEmpty()) {
	    return res.status(400).json({ 
		message: 'Translation has failed.',
		errors: result.array()
	    });
	}

	const data = matchedData(req);
	const {metadata,extra} = data;
	const validateInput = data.validate_input;
	const validateOutput = data.validate_output;
	const inputModelName = data.from;
	const outputModelName = data.to;
	
	let template;
	try{
	    template = cacheHandler.getTemplate(outputModelName,inputModelName);
	}
	catch(error){
	    return res.status(400).json({
		error: 'Translation not found',
		details:`Translation for ${inputModelName} to ${outputModelName} is not implemented`
	    });				
	}
	
	if (template === null){
	    return res.status(400).json({
		error: 'Translation not found',
		details:`Failed to load translation map for ${inputModelName} to ${outputModelName}`
	    });
	}
		
	//if asked to validate the input, perform the validation
	// - we have already checked if the schemas (inputModelName) as allowed/valid
	if(validateInput){
	    const resultInputValidation = validateMetadata(metadata,inputModelName);
            if (resultInputValidation.length>0) {
		return res.status(400).json({ 
                    error: 'Input metadata validation failed', 
                    details: resultInputValidation,
                    data: metadata
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

	let expression;
	try {
            expression = jsonata(template);
	}
	catch(error){
	    return res.status(400).json({
		details: error,
		error: 'JSONata failure'
	    })
	}

	let outputMetadata;
	try{ //note: would it be better as a .then() and .catch() ?
            outputMetadata = await expression.evaluate(source);
	}
	catch(error){ 
	    return res.status(400).json({
		details: error,
		error: 'Translation evaluation failure'
	    })
	};	  
    
	if(validateOutput){
	    const resultOutputValidation = validateMetadata(outputMetadata,outputModelName);
            if (resultOutputValidation.length>0) {
		return res.status(400).json({ 
                    error: 'Output metadata validation failed', 
                    details: resultOutputValidation,
                    data: metadata
		});
	    }
	}
	res.send(outputMetadata);
});


module.exports = router;
