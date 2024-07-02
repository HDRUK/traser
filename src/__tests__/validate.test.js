const request = require("supertest");
const app = require("../app");

const { sampleMetadata } = require("../utils/examples");

const validate = async (metadata, modelName, modelVersion) => {
    const requestBody = {
        metadata: metadata,
    };

    const response = await request(app)
        .post("/validate")
        .query({ input_schema: modelName, input_version: modelVersion })
        .send(requestBody);

    return response;
};

describe("POST /validate", () => {
    describe("POST /validate?input_schema=GWDM&input_version=1.0", () => {
        it("should return 200 if gdmv1 can be validated", async () => {
            const response = await validate(
                sampleMetadata.gdmv1,
                "GWDM",
                "1.0"
            );
            expect(response.status).toBe(200);
        });
    });
});

describe("POST /validate", () => {
    describe("POST validate?input_schema=HDRUK&input_version=2.1.2", () => {
        it("should return 200 if HDRUK 2.1.2 can be validated", async () => {
            const response = await validate(
                sampleMetadata.hdrukv211,
                "HDRUK",
                "2.1.2"
            );
            expect(response.status).toBe(200);
        });
    });
});
