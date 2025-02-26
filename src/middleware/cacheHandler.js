const axios = require("axios");
const fs = require("fs");
const NodeCache = require("node-cache");

const cacheStore = new NodeCache({ 
    stdTTL: process.env.CACHE_REFRESH_STDTLL || 3600,
    checkperiod: 600,
    useClones: false, 
    maxKeys: 1000 
});

const getFromLocal = (path) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path, "utf8", (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
};

const getFromUri = async (uri) => {
    try {
        const response = await axios.get(uri);
        return response.data;
    } catch (error) {
        console.error(`Error fetching data from URI: ${uri}`, error.message);
        throw error;
    }
};

const saveToCache = (key, data) => {
    cacheStore.set(key, data);
};

const getFromCache = (key) => {
    return cacheStore.get(key);
};

const getFromCacheOrUri = async (key, uri) => {
    let data = getFromCache(key);
    if (data === undefined) {
        try {
            data = await getFromUri(uri);
            saveToCache(key, data);
        } catch (error) {
            console.error(`Failed to fetch data for key ${key} from URI`);
            return null;
        }
    }
    return data;
};

const getFromCacheOrLocal = async (key, path) => {
    let data = getFromCache(key);
    if (data === undefined) {
        try {
            data = await getFromLocal(path);
            saveToCache(key, data);
        } catch (error) {
            console.error(`Failed to read local file: ${path}`, error.message);
            return null;
        }
    }
    return data;
};

module.exports = {
    cacheStore,
    saveToCache,
    getFromCache,
    getFromUri,
    getFromLocal,
    getFromCacheOrUri,
    getFromCacheOrLocal,
};
