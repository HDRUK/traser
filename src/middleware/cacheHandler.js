const axios = require('axios');

const NodeCache = require( "node-cache" );
const cacheStore = new NodeCache({stdTTL:process.env.CACHE_REFRESH_STDTLL});


const getFromUri = async(uri) => {
    //need to implement catching errors...
    console.log('retrieving data for '+uri);
    const response = await axios.get(uri)
    data = response.data;
    return data;
}

const saveToCache = (key,data) => {
    cacheStore.set(key,data);
}


const getFromCacheOrUri = async (key,uri) => {
    let data = await cacheStore.get(key);
    if (data === undefined){
        data = await getFromUri(uri);
        saveToCache(key,data);
    }
    return data;
}


module.exports = {
    cacheStore,
    saveToCache,
    getFromCacheOrUri,
    getFromUri,
};
