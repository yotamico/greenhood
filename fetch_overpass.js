const https = require('https');
const fs = require('fs');

const query = '[out:json][timeout:60];area["name"="נס ציונה"]["boundary"="administrative"]->.city;way["highway"]["name"](area.city);out center;';
const body = 'data=' + encodeURIComponent(query);

const options = {
  hostname: 'overpass-api.de',
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(body),
    'User-Agent': 'eco-navigation/1.0'
  }
};

const outFile = __dirname + '/overpass_nes_ziona.json';

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  const chunks = [];
  res.on('data', chunk => chunks.push(chunk));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (res.statusCode === 200) {
      fs.writeFileSync(outFile, buf);
      const json = JSON.parse(buf.toString('utf8'));
      console.log('elements:', json.elements.length);
      // Print first 3 names
      json.elements.slice(0, 3).forEach(e => console.log(' ', e.tags && e.tags.name));
    } else {
      console.error('HTTP error:', res.statusCode, buf.toString().slice(0, 200));
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
