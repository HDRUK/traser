const express = require('express');
const cacheHandler = require('../middleware/cacheHandler');
const { body, validationResult } = require('express-validator');

const router = express.Router();


/**
 * @swagger
 * /find:
 *   post:
 *     summary: Validate posted metadata against available schemas
 *     description: Validate posted metadata against available schemas in the cacheHandler.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               metadata:
 *                 type: object
 *                 description: The metadata object to validate.
 *     responses:
 *       200:
 *         description: Schema validation results.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               description: List of schema validation results.
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: The name of the schema.
 *                   matches:
 *                     type: boolean
 *                     description: Indicates whether the metadata matches the schema.
 *       400:
 *         description: Bad request due to invalid content type or validation errors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   description: Array of validation errors.
 */
router.post(
    '/',
    body().custom((value, { req }) => {
        if (!req.is('application/json')) {
            throw new Error('Invalid content type. Expected JSON.');
        }
        return true;
    }),
    async (req, res) => {
	
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
	}

	//retrieve the posted data 
	const metadata = req.body;

	const result = cacheHandler.findMatchingSchema(metadata);
	
	res.send(result);
	
    });

module.exports = router
