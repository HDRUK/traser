const {
    getFromUri,
    getFromCacheOrUri,
    getFromLocal,
    getFromCacheOrLocal,
    saveToCache,
} = require("./cacheHandler");

const templatesPath = process.env.TEMPLATES_LOCATION;
const loadFromLocalFile = !templatesPath.startsWith("http");
const templatesFilename = "translation.jsonata";

const getFromCacheOrOther = loadFromLocalFile
    ? getFromCacheOrLocal
    : getFromCacheOrUri;
const getFromOther = loadFromLocalFile ? getFromLocal : getFromUri;

const getTemplatePath = (
    inputModel,
    inputVersion,
    outputModel,
    outputVersion
) => {
    return `${templatesPath}/maps/${outputModel}/${outputVersion}/${inputModel}/${inputVersion}/${templatesFilename}`;
};

const getFormHydrationTemplatePath = (
    outputModel,
    outputVersion
) => {
    return `${templatesPath}/maps/Hydration/${outputModel}/${outputVersion}/${templatesFilename}`;
};

const getAvailableTemplates = async () => {
    let available = await getFromCacheOrOther(
        "templates:available",
        templatesPath + "/available.json"
    );
    if (typeof available === "string") {
        available = JSON.parse(available);
    }
    return available;
};

const getTemplate = async (
    inputModelName,
    inputModelVersion,
    outputModelName,
    outputModelVersion
) => {
    const templatePath = getTemplatePath(
        inputModelName,
        inputModelVersion,
        outputModelName,
        outputModelVersion
    );
    const template = await getFromCacheOrOther(templatePath, templatePath);
    return template;
};

const retrieveTemplate = async (
    inputModelName,
    inputModelVersion,
    outputModelName,
    outputModelVersion
) => {
    const templatePath = getTemplatePath(
        inputModelName,
        inputModelVersion,
        outputModelName,
        outputModelVersion
    );
    const template = await getFromOther(templatePath, templatePath);
    saveToCache(templatePath, template);
};

const loadTemplates = async () => {
    const templates = await getAvailableTemplates();
    await Promise.all(
        templates.map((t) => {
            retrieveTemplate(
                t.input_model,
                t.input_version,
                t.output_model,
                t.output_version
            ).catch((error) => {
                console.error(error);
            });
        })
    );
};

const getFormHydrationTemplate = async (
    outputModel,
    outputModelVersion
) => {
    const hydrationTemplatePath = getFormHydrationTemplatePath(
        outputModel,
        outputModelVersion
    );
    const template = await getFromCacheOrOther(hydrationTemplatePath, hydrationTemplatePath);
    return template;
}

module.exports = {
    getAvailableTemplates,
    getTemplate,
    loadTemplates,
    getFormHydrationTemplate,
};
