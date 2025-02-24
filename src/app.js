const express = require('express');
//documentation
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

//recommendations for express.js
const createError = require('http-errors');
const logger = require('morgan');
const helmet = require('helmet');
const path = require('path');
const publishMessage = require('./middleware/auditHandler');

require('dotenv').config();

//load middleware
const errorHandler = require('./middleware/errorHandler');
const {
	cacheStore,
	getFromCache,
	saveToCache,
} = require('./middleware/cacheHandler');
const { ajv, loadSchemas } = require('./middleware/schemaHandler');
const { loadTemplates } = require('./middleware/templateHandler');

const indexRouter = require('./routes/index');
const translateRouter = require('./routes/translate');
const getRouter = require('./routes/get');
const findRouter = require('./routes/find');
const listRouter = require('./routes/list');
const validateRouter = require('./routes/validate');

const app = express();

// additional setups
app.use(helmet());
app.use(logger('dev'));
app.use(express.json({ limit: '512mb' }));
app.use(express.urlencoded({ extended: false, limit: '512mb' }));


/*setup middleware to loadData before any route is used
   - if the dataIsLoaded is false then load all the data required..
   - dataIsLoaded will expire based on {stdTTL:process.env.CACHE_REFRESH_STDTLL}
*/
const loadData = async (req, res, next) => {
  try {
    const isLoaded = await getFromCache('dataIsLoaded');
    if (isLoaded) {
      return next();
    }

    publishMessage('UPDATE', 'loadData', 'Refreshing the data cache');
    
    // Add a lock mechanism to prevent multiple requests from refreshing data at the same time
    const lock = await getFromCache('dataLoading');
    if (lock) {
      // If data is being loaded, wait a bit and try again
      setTimeout(() => loadData(req, res, next), 500);
      return;
    }

    await saveToCache('dataLoading', true);

    // Load schemas and templates concurrently, then mark cache as loaded
    await Promise.all([loadSchemas(), loadTemplates()]);
    await saveToCache('dataIsLoaded', true);
    await saveToCache('dataLoading', false);

    next();
  } catch (error) {
    console.error("Data loading failed:", error);
    next(createError(500, "Failed to load data"));
  }
};

app.use(loadData);

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
  apis: ['src/routes/*.js'],
};
const swaggerSpec = swaggerJsdoc(options);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

//register all the routes
app.use('/', indexRouter);
app.use('/translate', translateRouter);
app.use('/get', getRouter);
app.use('/find', findRouter);
app.use('/list', listRouter);
app.use('/validate', validateRouter);

// Serve static files from the "public" folder
app.use('/files', express.static(path.join(__dirname, 'public')));

// catch 404 and forward to error handler
app.use((req, res, next) => {
  next(createError.NotFound());
});

// pass any unhandled errors to the error handler
app.use(errorHandler);

module.exports = app;
