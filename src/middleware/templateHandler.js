const {redisClient,getFromCacheOrUri} = require('./cacheHandler');

const axios = require('axios');
const templatesUri = 'https://raw.githubusercontent.com/HDRUK/traser-mapping-files/master'

const getTemplateUri = (inputModel,inputVersion,outputModel,outputVersion) => {
    return `${templatesUri}/maps/${outputModel}/${outputVersion}/${inputModel}/${inputVersion}/translation.jsonata`
}

const getAvailableTemplates = async () => {
    const available = await getFromCacheOrUri('templates:available',templatesUri+'/available.json');
    return available;
};

const getTemplate = async(inputModelName,inputModelVersion,outputModelName,outputModelVersion) => {
    const templateUri = getTemplateUri(inputModelName,inputModelVersion,outputModelName,outputModelVersion);
    const template = await getFromCacheOrUri(templateUri,templateUri);
    return template;
}



module.exports = {
    getAvailableTemplates,
    getTemplate
};
