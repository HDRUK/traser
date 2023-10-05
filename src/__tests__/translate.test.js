const request = require("supertest");
const app = require("../app");

const { sampleMetadata } = require("../utils/examples");

const translate = async (
    metadata,
    inputModel,
    inputModelVersion,
    outputModel,
    outputModelVersion,
    validateInput = "1",
    validateOutput = "1",
    extra = null
) => {
    const requestBody = {
        metadata: metadata,
    };
    if (extra !== null) {
        requestBody.extra = extra;
    }

    const response = await request(app)
        .post("/translate")
        .query({
	    output_schema: outputModel,
            output_version: outputModelVersion,
            input_schema: inputModel,
            input_version: inputModelVersion,
            validate_input: validateInput,
            validate_output: validateOutput,
	})
        .send(requestBody);

    return response;
};

describe("POST /translate", () => {
    describe("POST /translate?output_schema=SchemaOrg&output_version=default&input_schema=GWDM&input_version=1.0", () => {
        it("should return 200 if gdmv1 metadata translated to schema.org", async () => {
            const response = await translate(
                sampleMetadata.gdmv1,
                "GWDM",
                "1.0",
                "SchemaOrg",
                "default"
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate?output_schema=SchemaOrg&output_version=BioSchema&input_schema=GWDM&input_version=1.0", () => {
        it("should return 200 if gdmv1 metadata translated to schema.org", async () => {
            const response = await translate(
                sampleMetadata.gdmv1,
                "GWDM",
                "1.0",
                "SchemaOrg",
                "BioSchema"
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate?input_schema=SchemaOrg&input_version=default&output_schema=GWDM&output_version=1.0", () => {
        it("should return 200 if schema.org metadata translated to GDMV1", async () => {
            const response = await translate(
                sampleMetadata.schemaorg,
                "SchemaOrg",
                "default",
                "GWDM",
                "1.0"
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate?input_schema=HDRUK&input_version=2.1.2&output_schema=GWDM&output_version=1.0", () => {
        it("should return 200 if HDRUK 2.1.1 metadata translated to GDMV1", async () => {
            const response = await translate(
                sampleMetadata.hdrukv211,
                "HDRUK",
                "2.1.2",
                "GWDM",
                "1.0",
                "1",
                "1",
                sampleMetadata.extra_hdrukv211
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate?output_schema=HDRUK&output_version=2.1.2&input_schema=GWDM&input_version=1.0", () => {
        it("should return 200 if  metadata GDMV1 translated to HDRUK 2.1.2", async () => {
            const response = await translate(
                sampleMetadata.gdmv1,
                "GWDM",
                "1.0",
                "HDRUK",
                "2.1.2",
                "1",
                "1",
                sampleMetadata.extra_gdmv1
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate?output_schema=GWDM&output_version=1.0", () => {
        it("should return 200 if unknown metadata translated to GDMV1", async () => {
            const response = await translate(
                sampleMetadata.hdrukv211,
                undefined,
                undefined,
                "GWDM",
                "1.0",
                "1",
                "1",
                sampleMetadata.extra_hdrukv211
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate", () => {
        it("should return 200 if unknown metadata translated to GDMV1 (by default)", async () => {
            const response = await translate(
                sampleMetadata.hdrukv211,
                undefined,
                undefined,
                undefined,
                undefined,
                "1",
                "1",
                sampleMetadata.extra_hdrukv211
            );
            expect(response.status).toBe(200);
        });
    });

    describe("POST /translate?output_schema=GWDM", () => {
        it("should return 400 because output_schema is given but output_version is unknown", async () => {
            const response = await translate(
                sampleMetadata.hdrukv211,
                undefined,
                undefined,
                'GWDM',
                undefined,
                "1",
                "1",
                sampleMetadata.extra_hdrukv211
            );
            expect(response.status).toBe(400);
        });
    });

    describe("POST /translate", () => {
        it("should return 200 and itself unchanged", async () => {
            const response = await translate(
                sampleMetadata.gdmv1,
                undefined,
                undefined,
		undefined,
                undefined,
            );
            expect(response.status).toBe(200);
	    expect(response.body).toMatchObject(sampleMetadata.gdmv1);
        });
    });

});
