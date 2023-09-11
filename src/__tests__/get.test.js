const request = require('supertest');
const app = require('../app');

describe('GET /get/schema', () => {
    describe('GET /get/schema?name=hdrukv211', () => {
	it('should return 200 if hdrukv211 schema is retrieved', async () => {

	    const response = await request(app)
		  .get('/get/schema')
		  .query({ name:'hdrukv211'});
	    expect(response.status).toBe(200);
	});
    });

    describe('GET /get/schema?name=gdmv1', () => {
	it('should return 200 if gdmv1 schema is retrieved', async () => {

	    const response = await request(app)
		  .get('/get/schema')
		  .query({ name:'gdmv1'});
	    expect(response.status).toBe(200);
	});
    });
    
});
