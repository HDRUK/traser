const request = require("supertest");
const app = require("../app");

describe("GET /get/schema", () => {
    describe("GET /get/schema?name=HDRUK&version=2.1.2", () => {
        it("should return 200 if HDRUK 2.1.2 schema is retrieved", async () => {
            const response = await request(app)
                .get("/get/schema")
                .query({ name: "HDRUK", version: "2.1.2" });
            expect(response.status).toBe(200);
        });
    });

    describe("GET /get/schema?name=GWDM&version=1.0", () => {
        it("should return 200 if GWDM 1.0 schema is retrieved", async () => {
            const response = await request(app)
                .get("/get/schema")
                .query({ name: "GWDM", version: "1.0" });
            expect(response.status).toBe(200);
        });
    });
});


describe("GET /get/map", () => {
    
    describe("GET /get/map?", () => {
        it("should return 200 if translation map can be be retrieved", async () => {
            const response = await request(app)
                .get("/get/map")
                .query(
                    {
                        input_schema: 'HDRUK',
                        input_version:'2.1.2',
                        output_schema:'GWDM',
                        output_version:'1.0'
                    });
            expect(response.status).toBe(200);
        });
    });


});

