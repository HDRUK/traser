const request = require("supertest");
const app = require("../app");

const { sampleMetadata } = require("../utils/examples");

describe("POST /find", () => {
    describe("POST /find ", () => {
        it("should find that the metadata is the GWDM 1.0", async () => {
            const response = await request(app)
                .post("/find?with_errors=1")
                .send(sampleMetadata.gdmv1);
            const found = response.body.find(
                (i) => i.name === "GWDM" && i.version === "1.0"
            ).matches;
            expect(found).toBe(true);
        });
    });

    describe("POST /find ", () => {
        it("should find that the metadata is the HDRUK 2.1.2", async () => {
            const response = await request(app)
                .post("/find")
                .send(sampleMetadata.hdrukv211);

            const found = response.body.find(
                (i) => i.name === "HDRUK" && i.version === "2.1.2"
            ).matches;
            expect(found).toBe(true);
        });
    });
});
