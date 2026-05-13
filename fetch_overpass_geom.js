const https = require('https');
const fs    = require('fs');
const path  = require('path');

const query = '[out:json][timeout:90];area["name"="נס ציונה"]["boundary"="administrative"]->.city;way["highway"]["name"](area.city);out geom;';
const body  = 'data=' + encodeURIComponent(query);

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

console.log('Fetching Overpass geometry...');
const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  const chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (res.statusCode !== 200) {
      console.error('Error:', buf.toString().slice(0, 300));
      return;
    }

    const data = JSON.parse(buf.toString('utf8'));
    console.log('Ways received:', data.elements.length);

    // Build map: streetName -> array of [lat, lng] arrays (one per way segment)
    const geomMap = {};
    for (const el of data.elements) {
      const name = el.tags && el.tags.name;
      if (!name || !el.geometry || el.geometry.length === 0) continue;
      const coords = el.geometry.map(pt => [pt.lat, pt.lon]);
      if (!geomMap[name]) {
        geomMap[name] = coords;
      } else {
        // If street has multiple segments, append
        geomMap[name] = geomMap[name].concat(coords);
      }
    }

    const outPath = path.join(__dirname, 'public', 'nes-ziona-geometry.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(geomMap), 'utf8');

    const streetCount = Object.keys(geomMap).length;
    console.log(`Saved geometry for ${streetCount} streets to public/nes-ziona-geometry.json`);
    console.log('Sample:', Object.keys(geomMap).slice(0, 5).join(', '));
  });
});
req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
