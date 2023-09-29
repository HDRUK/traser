const {redisClient,getFromCacheOrUri} = require('./cacheHandler');

const fs = require('fs');
const axios = require('axios');
const templatesUri = 'https://raw.githubusercontent.com/HDRUK/traser-mapping-files/master';
const localCopy = '/Users/calum/Software/Gateway2.0/traser-mapping-files';

const getTemplateUri = (inputModel,inputVersion,outputModel,outputVersion) => {
    return `${localCopy}/maps/${outputModel}/${outputVersion}/${inputModel}/${inputVersion}/translation.jsonata`
    //return `${templatesUri}/maps/${outputModel}/${outputVersion}/${inputModel}/${inputVersion}/translation.jsonata`
}

const getAvailableTemplates = async () => {
    const available = await getFromCacheOrUri('templates:available',templatesUri+'/available.json');
    //const available = require(localCopy+'/available.json');
    return available;
};

const getTemplate = async(inputModelName,inputModelVersion,outputModelName,outputModelVersion) => {
    const templateUri = getTemplateUri(inputModelName,inputModelVersion,outputModelName,outputModelVersion);
    console.log('here');
    return new Promise((resolve, reject) => {
        fs.readFile(templateUri, 'utf8', (err, data) => {
            if (err) {
		console.log('here');
		reject(err);
            } else {
		console.log('ok');
		resolve(data);
            }
        });
    });
    
    const template = require(templateUri);
    console.log('not here');
    //const template = await getFromCacheOrUri(templateUri,templateUri);
    return template;
}



module.exports = {
    getAvailableTemplates,
    getTemplate
};
