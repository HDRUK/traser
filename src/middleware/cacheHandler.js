const redis = require('redis');
const axios = require('axios');

const NodeCache = require( "node-cache" );
const cacheStore = new NodeCache();

const getFromCacheOrUri = async (key,uri) => {
    let data = await cacheStore.get(key);
    if (data === undefined){
	//need to implement catching errors...
	const response = await axios.get(uri)
	data = response.data;
	cacheStore.set(key,data);
    }
    return data;
}


module.exports = {
    cacheStore,
    getFromCacheOrUri,
};
