const express = require('express');

const swaggerJsdoc = require("swagger-jsdoc"),
      swaggerUi = require("swagger-ui-express");

const swaggerDocument = require('../swagger.json');


const createError = require('http-errors');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const path = require('path');

const indexRouter = require('./routes/index');
const translateRouter = require('./routes/translate');
const getRouter = require('./routes/get');
const validateRouter = require('./routes/validate');
//const visualiseRouter = require('./routes/visualiser');

const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet()); // https://expressjs.com/en/advanced/best-practice-security.html#use-helmet
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Express API for JSONPlaceholder',
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


app.use('/', indexRouter);
app.use('/translate', translateRouter);
app.use('/get', getRouter);
app.use('/validate', validateRouter);
//app.use('/visualise', visualiseRouter);
// Serve static files from the "public" folder
app.use('/files',express.static(path.join(__dirname,'public')));

// catch 404 and forward to error handler
app.use((req, res, next) => {
    next(createError.NotFound());
});

// pass any unhandled errors to the error handler
app.use(errorHandler);



module.exports = app;
