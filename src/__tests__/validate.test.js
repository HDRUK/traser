const request = require('supertest');
const app = require('../app');


const {sampleMetadata} = require('../utils/examples');


const validate = async (metadata,modelName) => {
    const requestBody = {
	metadata: metadata
    }

    const response = await request(app)
	  .post('/validate')
	  .query({ model_name: modelName})
	  .send(requestBody);
    
    return response;
};

describe('POST /validate', () => {
    describe('POST /validate?model_name=gdmv1', () => {
	it('should return 200 if gdmv1 can be validated', async () => {
	    const response = await validate(sampleMetadata.gdmv1,
					    'gdmv1'
					   );
	    expect(response.status).toBe(200);
	});
    });
    
});

describe('POST /validate', () => {
    describe('POST /validate?model_name=hdrukv211', () => {
	it('should return 200 if HDRUK 2.1.1 can be validated', async () => {
	    const response = await validate(sampleMetadata.hdrukv211,
					    'hdrukv211'
					   );
	    expect(response.status).toBe(200);
	});
    });
    
});