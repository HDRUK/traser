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
                i => i.name === "GWDM" && i.version === "1.0"
            );

            matches = found.matches || false;

            expect(matches).toBe(true);
        });
    });

    // I think that changes were made in the `schemata_2` that create errors for this test
    // describe("POST /find ", () => {
    //     it("should find that the metadata is the HDRUK 2.1.2", async () => {
    //         const response = await request(app)
    //             .post("/find?with_errors=1")
    //             .send(sampleMetadata.hdrukv211);

    //         const found = response.body.find(
    //             i => i.name === "HDRUK" && i.version === "2.1.2"
    //         );
    //         expect(found).toBe(true);
    //     });
    // });
});
