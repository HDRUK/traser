const redis = require('redis');
const axios = require('axios');

const redisClient = redis.createClient({
  host: 'localhost', // Redis server host (use the appropriate host if it's not running locally)
  port: 6379, // Redis server port
});

const getFromCacheOrUri = async (key,uri) => {
    let data = await redisClient.get(key);
    if (data === null){
	const response = await axios.get(uri)
	data = response.data;
	redisClient.set(uri,JSON.stringify(data));
    }
    else{
	data = JSON.parse(data);
    }
    return data;
}


module.exports = {
    redisClient,
    getFromCacheOrUri,
};
