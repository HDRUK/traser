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

module.exports = {
    sampleMetadata:sampleMetadata
}
