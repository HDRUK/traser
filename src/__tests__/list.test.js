const request = require("supertest");
const app = require("../app");

describe("GET /list", () => {
    describe("GET /list/templates", () => {
        it("should return 200 if can list all templates available", async () => {
            const response = await request(app).get("/list/templates");
            //could update this test in the future to check against expected supported templates?
            expect(response.status).toBe(200);
        });
    });

    describe("GET /list/schemas", () => {
        it("should return 200 if can list all available schemas", async () => {
            const response = await request(app).get("/list/schemas");
            expect(response.status).toBe(200);

            const allSchemas = Object.keys(response.body);
            //minimal support...
            expect(allSchemas).toContain("SchemaOrg");
            expect(allSchemas).toContain("HDRUK");
            expect(allSchemas).toContain("GWDM");
        });
    });
});
