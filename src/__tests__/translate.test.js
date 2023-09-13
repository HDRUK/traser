const request = require('supertest');
const app = require('../app');

const {sampleMetadata} = require('../utils/examples');

const translate = async (metadata,
			 inputModel,inputModelVersion,
			 ouputModel,outputModelVersion,
			 validateInput='1',validateOutput='1',extra=null) => {
    const requestBody = {
	metadata: metadata
    }
    if (extra !==null){
	requestBody.extra = extra
    };

    const response = await request(app)
	  .post('/translate')
	  .query({ output: outputModel, output_version: outputModelVersion,
		   input: inputModel, input_version: inputModelVersion
		   validate_input: validateInput, validate_output: validateOutput})
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

    
    describe('POST /translate?output_model=SchemaOrg&input_model=GWDM&input_version=1.0', () => {
	it('should return 200 if gdmv1 metadata translated to schema.org', async () => {
	    const response = await translate(sampleMetadata.gdmv1,
					     'GWDM',
					     '1.0',
					     'SchemaOrg',
					     'default'
					    );
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?input_model=HDRUK&input_version=2.1.2&output_model=GWDM&output_version=1.0', () => {
	it('should return 200 if schema.org metadata translated to GDMV1', async () => {
	    const response = await translate(sampleMetadata.schemaorg,
					     'SchemaOrg',
					     'default',
					     'GWDM',
					     '1.0'
					    );
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?input_model=HDRUK&input_version=2.1.2&output_model=GWDM&output_version=1.0', () => {
	it('should return 200 if HDRUK 2.1.1 metadata translated to GDMV1', async () => {
	    const response = await translate(sampleMetadata.hdrukv211,
					     'HDRUK',
					     '2.1.2'
					     'GWDM',
					     '1.0'
					     '1',
					     '1',
					     sampleMetadata.extra_hdrukv211
					    );
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?output_model=HDRUK&output_version=2.1.2&input_model=GWDM&input_version=1.0', () => {
	it('should return 200 if  metadata GDMV1 translated to HDRUK 2.1.2', async () => {
	    const response = await translate(sampleMetadata.gdmv1,
					     'GWDM',
					     '1.0',
					     'HDRUK',
					     '2.1.2',
					     '1',
					     '1',
					     sampleMetadata.extra_gdmv1
					    );
	    expect(response.status).toBe(200);
	});
    });

    
});
