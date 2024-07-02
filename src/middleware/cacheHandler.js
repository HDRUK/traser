const axios = require("axios");
const fs = require("fs");
const NodeCache = require("node-cache");
const cacheStore = new NodeCache({ stdTTL: process.env.CACHE_REFRESH_STDTLL });

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
    //need to implement catching errors...
    const response = await axios.get(uri);
    data = response.data;
    return data;
};

const saveToCache = async (key, data) => {
    cacheStore.set(key, data);
};

const getFromCache = async (key) => {
    const data = await cacheStore.get(key);
    return data;
};

const getFromCacheOrUri = async (key, uri) => {
    let data = await getFromCache(key);
    if (data === undefined) {
        data = await getFromUri(uri);
        saveToCache(key, data);
    }
    return data;
};

const getFromCacheOrLocal = async (key, uri) => {
    let data = await getFromCache(key);
    if (data === undefined) {
        data = await getFromLocal(uri);
        saveToCache(key, data);
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
