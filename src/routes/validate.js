const express = require('express');
const {getAvailableSchemas, getSchemas, validateMetadata} = require('../middleware/schemaHandler');
const { body, param, query, validationResult, matchedData } = require('express-validator');
const router = express.Router();


router.post(
    '/',
    [
    	body('metadata')
	    .isObject()
	    .notEmpty()
	    .bail(),
	query(['model_name'])
	    .exists()
	    .bail()
	    .isIn(getAvailableSchemas())
	    .withMessage("Not a known schema. Options: "+getAvailableSchemas())
    ],
    async (req, res) => {

	const result = validationResult(req);
	if (!result.isEmpty()) {
	    return res.status(400).json({ 
		message: 'Validation has failed',
		errors: result.array()
	    });
	}


    	const data = matchedData(req);
	const {metadata} = data;
	const modelName =  data.model_name;

 	const metadataValidationResult = validateMetadata(metadata,modelName);
	if (metadataValidationResult.length>0) {
	    return res.status(400).json({ 
		error: 'metadata validation failed', 
		details: metadataValidationResult,
		data: metadata
	    });
	}
	else{
	    return res.send({details:'all ok'})
	}
	
    }
);


router.get(
    '/:model',
    [
	param('model')
	    .exists()
	    .bail()
	    .isIn(getAvailableSchemas())
	    .withMessage("Not a known schema. Options: "+getAvailableSchemas())
    ],
    async (req, res) => {

	const {model} = matchedData(req);	
	const schemas = getSchemas();
	res.send(schemas[model]);

    }
);

module.exports = router
