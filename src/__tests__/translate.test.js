const request = require('supertest');
const app = require('../app');

const {sampleMetadata} = require('../utils/examples');


const translate = async (metadata,inputModel,outputModel,validateInput='1',validateOutput='1',extra=null) => {
    const requestBody = {
	metadata: metadata
    }
    if (extra !==null){
	requestBody.extra = extra
    };

    const response = await request(app)
	  .post('/translate')
	  .query({ to: outputModel, from: inputModel, validate_input: validateInput, validate_output: validateOutput})
	  .send(requestBody);
    
    return response;
};


function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

beforeAll((done) => {
    // need a better way of doing this...
    // waiting for the app to load templates before trying to run tests 
    // app.emit() ?
    delay(1000).then(() => {
	console.log('ran after 1 second1 passed');
	done();
    });
 });

describe('POST /translate', () => {

    
    describe('POST /translate?to=schemaorg&from=gdmv1 ', () => {
	it('should return 200 if gdmv1 metadata translated to schema.org', async () => {
	    const response = await translate(sampleMetadata.gdmv1,
					     'gdmv1',
					     'schemaorg'
					    );
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?to=gdmv1&from=schemaorg ', () => {
	it('should return 200 if schema.org metadata translated to GDMV1', async () => {
	    const response = await translate(sampleMetadata.schemaorg,
					     'schemaorg',
					     'gdmv1'
					    );
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?to=gdmv1&from=hdrukv211', () => {
	it('should return 200 if HDRUK 2.1.1 metadata translated to GDMV1', async () => {
	    const response = await translate(sampleMetadata.hdrukv211,
					     'hdrukv211',
					     'gdmv1',
					     '1',
					     '1',
					     sampleMetadata.extra_hdrukv211
					    );
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?to=hdrukv211&from=gdmv1', () => {
	it('should return 200 if  metadata GDMV1 translated to HDRUK 2.1.1', async () => {
	    const response = await translate(sampleMetadata.gdmv1,
					     'gdmv1',
					     'hdrukv211',
					     '1',
					     '1',
					     sampleMetadata.extra_gdmv1
					    );
	    expect(response.status).toBe(200);
	});
    });

    
});
