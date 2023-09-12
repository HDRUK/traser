const express = require('express');
const jsonata = require('jsonata');
const {getTemplates} = require('../middleware/templateHandler');
const {getSchemas} = require('../middleware/schemaHandler');

const { query, validationResult, matchedData } = require('express-validator');

const router = express.Router();

/**
 * @swagger
 * /list/templates:
 *   get:
 *     summary: Retrieve available template mappings
 *     description: Retrieve available template mappings from the current cache
 *     responses:
 *       200:
 *         description: List of available template mappings.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: array
 *                   description: List of available template mappings.
 *                   items:
 *                     type: object
 *                     properties:
 *                       to:
 *                         type: string
 *                         description: The target schema.
 *                       from:
 *                         type: array
 *                         description: List of source schemas.
 *                         items:
 *                           type: string
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Description of the error.
 */
router.get(
    '/templates',
    async (req, res) => {
	const templates = getTemplates();
	let retval = Object.keys(templates).map(k => {
	    const o = {'to':k,'from':Object.keys(templates[k])};
	    return o;
	});
			       
	res.send({'available':retval});
    }
)

/**
 * @swagger
 * /list/schemas:
 *   get:
 *     summary: Retrieve available schema names
 *     description: Retrieve available schema names from the cache.
 *     responses:
 *       200:
 *         description: List of available schema names.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               description: List of available schema names.
 *               items:
 *                 type: string
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   description: Description of the error.
 */
router.get(
    '/schemas',
    async (req, res) => {
	const schemas = Object.keys(getSchemas());
	res.send(schemas);
    }
)


module.exports = router;
