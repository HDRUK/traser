const express = require('express');
const jsonata = require('jsonata');
const cacheHandler = require('../middleware/cacheHandler');

const { query, validationResult, matchedData } = require('express-validator');

const router = express.Router();

/**
 * @swagger
 * /list/templates:
 *   get:
 *     summary: Retrieve available template mappings
 *     description: Retrieve available template mappings from the cacheHandler.
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
	const templates = cacheHandler.getTemplates();
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
 *     description: Retrieve available schema names from the cacheHandler.
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
	const schemas = Object.keys(cacheHandler.getSchemas());
	res.send(schemas);
    }
)


module.exports = router;
