const jsonata = require("jsonata");
const {
    getAvailableSchemas,
    findMatchingSchemas,
} = require("../../middleware/schemaHandler");

const {
    getTemplate,
    getAvailableTemplates,
} = require("../../middleware/templateHandler");

const findModelAndVersion = async (metadata, selectFirstMatching) => {
    const availableSchemas = await getAvailableSchemas();

    const matchingSchemas = await findMatchingSchemas(metadata);
    const matchingSchemasOnly = matchingSchemas.filter(
        (item) => item.matches === true
    );

    if (matchingSchemasOnly.length < 1) {
        return {
            error: {
                status: 400,
                message: "Input metadata object matched no known schemas",
                details: {
                    available_schemas: availableSchemas,
                },
            },
        };
    } else if (matchingSchemasOnly.length > 1 && !selectFirstMatching) {
        //raise an error if multiple schemas are matching and the default to select
        // the first matching schemas is not true
        return {
            error: {
                status: 400,
                message:
                    "Input metadata object matched multiple schemas! Something could be wrong..",
                details: matchingSchemas,
            },
        };
    }
    return {
        name: matchingSchemasOnly[0].name,
        version: matchingSchemasOnly[0].version,
    };
};

const getDefaultModelAndVersion = async (name, version) => {
    const availableSchemas = await getAvailableSchemas();
    if (name && !version) {
        return {
            error: {
                status: 400,
                message: "Translation not possible",
                details: `Attempting to translate to ${name} but no version provided!`,
            },
        };
    }
    const gwdmVersions = availableSchemas.GWDM;
    if (gwdmVersions) {
        return {
            name: "GWDM",
            version: gwdmVersions[gwdmVersions.length - 1],
        };
    } else {
        //really shouldnt be getting here... should always have the GWDM loaded...
        return {
            error: {
                status: 500,
                message: "Translation not possible",
                details: `Unknown model and version to translate to, use ?output_schema=<model>&?output_version=<version>`,
            },
        };
    }
};

const translate = async (
    metadata,
    extra,
    inputModelName,
    inputModelVersion,
    outputModelName,
    outputModelVersion
) => {
    if (
        inputModelName == outputModelName &&
        inputModelVersion == outputModelVersion
    ) {
        //dont translate if there is no translation to be done, rather than failing
        return { outputMetadata: metadata };
    }

    let template;
    try {
        template = await getTemplate(
            inputModelName,
            inputModelVersion,
            outputModelName,
            outputModelVersion
        );
    } catch (error) {
        return {
            error: {
                status: 500,
                message: `Translation for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion} has failed`,
                details: error.message,
            },
        };
    }

    if (template === null) {
        return {
            error: {
                status: 400,
                message: "Translation not found",
                details: `Failed to load translation map for ${inputModelName} to ${outputModelName}`,
            },
        };
    }

    //create an object to be used within JSONata
    //note:
    // - might want to revisit calling this 'input'?
    // - using 'input' as this is used in the templates
    const source = {
        input: metadata,
        extra: extra,
    };

    let expression;
    try {
        expression = jsonata(template);
    } catch (error) {
        return {
            error: {
                status: 400,
                details: error,
                message: `JSONata failure for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion}`,
            },
        };
    }

    let translatedMetadata;
    try {
        //note: would it be better as a .then() and .catch() ?
        translatedMetadata = await expression.evaluate(source);
    } catch (error) {
        return {
            error: {
                status: 400,
                details: error,
                message: `Translation evaluation failure for ${inputModelName}-${inputModelVersion} to ${outputModelName}-${outputModelVersion} `,
            },
        };
    }

    return { translatedMetadata: translatedMetadata };
};

module.exports = {
    translate,
    findModelAndVersion,
    getDefaultModelAndVersion,
};
