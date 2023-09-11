const request = require('supertest');
const app = require('../app');

const fs = require('fs');
const path = require('path');

const sampleMetadata = {};
const sampleMetadataDir = path.join(__dirname, './data'); 

fs.readdirSync(sampleMetadataDir).forEach((file) => {
  if (file.endsWith('.json')) {
    const fileName = path.parse(file).name;
    const filePath = path.join(sampleMetadataDir, file);
    sampleMetadata[fileName] = require(filePath);
  }
});

describe('app', () => {
  it('should export the express app correctly', () => {
    expect(app).toBeTruthy();
  });

  describe('GET /', () => {
    it('should respond to the GET method with 200', async () => {
      const response = await request(app).get('/');
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /404', () => {
    beforeEach(() => {
      // Avoid polluting the test output with 404 error messages
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should respond to the GET method with a 404 for a route that does not exist', async () => {
      const response = await request(app).get('/404');
      expect(response.statusCode).toBe(404);
      expect(response.text).toBe('{"message":"Not Found"}');
    });

    it('should respond to the POST method with a 404 for a route that does not exist', async () => {
      const response = await request(app).post('/404');
      expect(response.statusCode).toBe(404);
      expect(response.text).toBe('{"message":"Not Found"}');
    });
  });
});


const translate = async (metadata,inputModel,outputModel,validateInput='1',validateOutput='1') => {
    const requestBody = {
	metadata: metadata
    };

    const response = await request(app)
	  .post('/translate')
	  .query({ to: outputModel, from: inputModel, validate_input: validateInput, validate_output: validateOutput})
	  .send(requestBody);
    
    return response;
};
    

describe('POST /translate', () => {

    describe('POST /translate?to=schemaorg&from=gdmv1 ', () => {
	it('should return 200 if gdmv1 metadata translated to schema.org', async () => {
	    const response = await translate(sampleMetadata.gwdm,'gdmv1','schemaorg');
	    expect(response.status).toBe(200);
	});
    });

    describe('POST /translate?to=gdmv1&from=schemaorg ', () => {
	it('should return 200 if schema.org metadata translated to GDMV1', async () => {
	    const response = await translate(sampleMetadata.schemaorg,'schemaorg','gdmv1');
	    expect(response.status).toBe(200);
	});
    });
    
});
