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
	it('should find that the metadata is the GWDM 1.0', async () => {
	    const response = await request(app)
		  .post('/find')
		  .send(sampleMetadata.gdmv1);
	    const found = response.body.find(i => i.name === 'GWDM' && i.version === '1.0').matches;
	    expect(found).toBe(true);
	});
    });

    describe('POST /find ', () => {
	it('should find that the metadata is the HDRUK 2.1.2', async () => {
	    const response = await request(app)
		  .post('/find')
		  .send(sampleMetadata.hdrukv211);

	    const found = response.body.find(i => i.name === 'HDRUK' && i.version === '2.1.2' ).matches;
	    expect(found).toBe(true);
	});
    });
    
});


afterAll(async () => {
    await app.shutdown(); 
});
