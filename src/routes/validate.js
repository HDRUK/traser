const express = require('express');
const cacheHandler = require('../middleware/cacheHandler');
const { body, param, query, validationResult, matchedData } = require('express-validator');
const router = express.Router();


function validateMetadata(metadata,modelName){
    const schemas = cacheHandler.getSchemas();
    const validator = schemas[modelName].validator;
    const isValid = validator(metadata);
    if(!isValid){
	return validator.errors;
    }
    else{
	return [];
    }
}

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
	    .isIn(cacheHandler.getAvailableSchemas())
	    .withMessage("Not a known schema. Options: "+cacheHandler.getAvailableSchemas())
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
	    .isIn(cacheHandler.getAvailableSchemas())
	    .withMessage("Not a known schema. Options: "+cacheHandler.getAvailableSchemas())
    ],
    async (req, res) => {

	const {model} = matchedData(req);	
	const schemas = cacheHandler.getSchemas();
	res.send(schemas[model]);

    }
);

module.exports = {
    validateRouter: router,
    validateMetadata: validateMetadata
}
