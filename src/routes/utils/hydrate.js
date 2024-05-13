const jsonata = require("jsonata");
const { getFormHydrationTemplate } = require("../../middleware/templateHandler");
const { retrieveHydrationSchema } = require("../../middleware/schemaHandler");

const hydrate = async (
    modelName,
    modelVersion,
    dataTypes
) => {
    let template = await getFormHydrationTemplate(modelName, modelVersion);
    let source = await retrieveHydrationSchema(modelName, modelVersion);

    source.dataTypes = dataTypes.split(',');

    try {
        if (template != null && source != null) {
            let expression, translatedMetadata;

            try {
                expression = jsonata(template);
            } catch (error) {
                return {
                    error: {
                        status: 400,
                        details: error,
                        message: `JSONata failure for ${modelName}-${modelVersion}`,
                    },
                };
            }

            try {
                translatedMetadata = await expression.evaluate(source);
            } catch (error) {
                return {
                    error: {
                        status: 400,
                        details: error,
                        message: `Hydration evaluation failure for ${modelName}-${modelVersion}`,
                    },
                };
            }

            return { translatedMetadata: translatedMetadata };
        }
    } catch (error) {
        return {
            error: {
                status: 500,
                message: `Hydration for ${modelName}-${modelVersion} failed`,
                details: error.message,
            },
        };
    }
};

module.exports = {
    hydrate,
};
