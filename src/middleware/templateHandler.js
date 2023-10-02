const {getFromCacheOrUri,getFromUri,saveToCache} = require('./cacheHandler');

//const templatesUri = 'https://raw.githubusercontent.com/HDRUK/traser-mapping-files/master';
const templatesUri = 'https://raw.githubusercontent.com/HDRUK/traser-mapping-files/fix-structural-metadata';

const getTemplateUri = (inputModel,inputVersion,outputModel,outputVersion) => {
    return `${templatesUri}/maps/${outputModel}/${outputVersion}/${inputModel}/${inputVersion}/translation.jsonata`
}

const getAvailableTemplates = async () => {
    const available = await getFromCacheOrUri('templates:available',templatesUri+'/available.json');
    //const available = require(localCopy+'/available.json');
    return available;
};


const getTemplate = async(inputModelName,inputModelVersion,outputModelName,outputModelVersion) => {
    const templateUri = getTemplateUri(inputModelName,inputModelVersion,outputModelName,outputModelVersion);
    const template = await getFromCacheOrUri(templateUri,templateUri);
    return template;
}

const retrieveTemplate = async(inputModelName,inputModelVersion,outputModelName,outputModelVersion) => {
    const templateUri = getTemplateUri(inputModelName,inputModelVersion,outputModelName,outputModelVersion);
    const template = await getFromUri(templateUri,templateUri);
    saveToCache(templateUri,template);
}

const loadTemplates = async () => {
    const templates = await getAvailableTemplates();
    templates.map(t => {
        retrieveTemplate(t.input_model,t.input_version,t.output_model,t.output_version)
        .catch(error => {
            console.error(error);
        });
    })
}


module.exports = {
    getAvailableTemplates,
    getTemplate,
    loadTemplates,
};
