const request = require('supertest');
const app = require('../app');

const {sampleMetadata} = require('../utils/examples');



function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

beforeAll((done) => {
    // need a better way of doing this...
    // waiting for the app to load templates before trying to run tests 
    // app.emit() ?
    delay(1000).then(() => {
	done();
    });
 });


describe('POST /find', () => {

    
    describe('POST /find ', () => {
	it('should find that the metadata is the gdmv1', async () => {
	    const response = await request(app)
		  .post('/find')
		  .send(sampleMetadata.gdmv1);
	    const found = response.body.find(i => i.name === 'gdmv1').matches;
	    expect(found).toBe(true);
	});
    });

    describe('POST /find ', () => {
	it('should find that the metadata is the hdruk 2.1.1', async () => {
	    const response = await request(app)
		  .post('/find')
		  .send(sampleMetadata.hdrukv211);
	    const found = response.body.find(i => i.name === 'hdrukv211').matches;
	    expect(found).toBe(true);
	});
    });
    
});
