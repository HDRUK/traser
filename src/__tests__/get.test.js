const request = require('supertest');
const app = require('../app');

describe('GET /get/schema', () => {
    describe('GET /get/schema?name=HDRUK', () => {
	it('should return 200 if HDRUK 2.1.2 schema is retrieved', async () => {

	    const response = await request(app)
		  .get('/get/schema')
		  .query({ name:'HDRUK', version: '2.1.2'});
	    expect(response.status).toBe(200);
	});
    });

    describe('GET /get/schema?name=GWDM', () => {
	it('should return 200 if GWDM 1.0 schema is retrieved', async () => {

	    const response = await request(app)
		  .get('/get/schema')
		  .query({ name:'GWDM', version: '1.0'});
	    expect(response.status).toBe(200);
	});
    });
    
});

afterAll(async () => {
    await app.shutdown(); // Properly close the Redis connection
});
