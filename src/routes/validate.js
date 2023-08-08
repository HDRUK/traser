const express = require('express');
const cache = require('../middleware/cacheFiles');

const router = express.Router();



router.get('/:model', async (req, res) => {

    const model = req.params.model;
  
    //retrieve all allowed schemas 
    const schemas = cache.getSchemas();

    if(!Object.keys(schemas).includes(model)){
        return res.status(400).json({ 
            error: 'Not a known schema',
            details: model
        })
    }

    console.log(schemas[model]);
    res.send(schemas[model]);


});

module.exports = router;
