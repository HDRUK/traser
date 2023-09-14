const redis = require('redis');
const axios = require('axios');

const redisClient = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT
});

const getFromCacheOrUri = async (key,uri) => {
    let data = await redisClient.get(key);
    if (data === null){
	//need to implement catching errors...
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
