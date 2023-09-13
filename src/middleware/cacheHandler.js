const redis = require('redis');

const redisClient = redis.createClient({
  host: 'localhost', // Redis server host (use the appropriate host if it's not running locally)
  port: 6379, // Redis server port
});


module.exports = {
    redisClient,
};
