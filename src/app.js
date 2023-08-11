const express = require('express');

//documentation 
const swaggerJsdoc = require("swagger-jsdoc"),
      swaggerUi = require("swagger-ui-express");

//recommendations for express.js
const createError = require('http-errors');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const path = require('path');

//load API routes
const indexRouter = require('./routes/index');
const translateRouter = require('./routes/translate');
const getRouter = require('./routes/get');
const findRouter = require('./routes/find');
const listRouter = require('./routes/list');
const validateRouter = require('./routes/validate');

//load middleware
const errorHandler = require('./middleware/errorHandler');
const cacheHandler = require('./middleware/cacheHandler');

//create the app
const app = express();

//call the cacheHandler to load all files
// - this will be revisted when we implement file caching properly
// - i.e. if files are changed, will have to call .load() again
// Notes:
// - can we deploy is prod so that the app watches for file changes?
//   (in a similar way to how it works in dev localy)
cacheHandler.loadData();

//additional setups
app.use(helmet()); // https://expressjs.com/en/advanced/best-practice-security.html#use-helmet
app.use(logger('dev')); //may want to remove/change this for production (?)
//setup express.js
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); //not sure if this is needed?

// Temporary loading up swagger API for auto documentations
// Notes:
// - could/should switch to a loading configuration from json
// - const swaggerDocument = require('../swagger.json');
// - could/should put this in a seperate file (not in app.js)
const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Express API for metadata JSON translation service',
    version: '1.0.0',
  },
};
const options = {
    swaggerDefinition,
    apis: ['src/routes/*.js']
}
const swaggerSpec = swaggerJsdoc(options);
app.use('/docs',swaggerUi.serve,swaggerUi.setup(swaggerSpec));
//app.use('/docs',swaggerUi.serve,swaggerUi.setup(swaggerDocument));

//register all the routes
app.use('/', indexRouter);
app.use('/translate', translateRouter);
app.use('/get', getRouter);
app.use('/find', findRouter);
app.use('/list', listRouter);
app.use('/validate', validateRouter);

// Serve static files from the "public" folder
app.use('/files',express.static(path.join(__dirname,'public')));

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createError.NotFound());
});

// pass any unhandled errors to the error handler
app.use(errorHandler);

module.exports = app;
