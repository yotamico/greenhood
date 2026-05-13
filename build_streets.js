const fs = require('fs');

// Strip BOM if present
function readJson(p) {
  let raw = fs.readFileSync(p, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  return JSON.parse(raw);
}
const overpass = readJson(__dirname + '/overpass_nes_ziona.json');
const streets  = readJson(__dirname + '/ness_ziona_streets.json');

// Group Overpass elements by name, average their centers
const byName = {};
for (const el of overpass.elements) {
  const name = el.tags && el.tags.name;
  if (!name || !el.center) continue;
  if (!byName[name]) byName[name] = { latSum: 0, lngSum: 0, count: 0 };
  byName[name].latSum += el.center.lat;
  byName[name].lngSum += el.center.lon;
  byName[name].count++;
}

// Also build a lookup with reversed word-order for "שם פרטי שם משפחה" vs "שם משפחה שם פרטי"
const byNameReversed = {};
for (const [name, coords] of Object.entries(byName)) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ');
    if (!byNameReversed[reversed]) byNameReversed[reversed] = coords;
  }
}

let matched = 0, missing = [];

const lines = [
  'export interface Street {',
  '  name: string;',
  '  collection_day: string;',
  '  takeout_day: string;',
  '  lat: number | null;',
  '  lng: number | null;',
  '}',
  '',
  'export const NES_ZIONA_STREETS: Street[] = ['
];

for (const s of streets) {
  const g = byName[s.name] || byNameReversed[s.name];
  let lat = null, lng = null;
  if (g) {
    lat = parseFloat((g.latSum / g.count).toFixed(6));
    lng = parseFloat((g.lngSum / g.count).toFixed(6));
    matched++;
  } else {
    missing.push(s.name);
  }
  lines.push(`  { name: ${JSON.stringify(s.name)}, collection_day: ${JSON.stringify(s.collection_day)}, takeout_day: ${JSON.stringify(s.takeout_day)}, lat: ${lat}, lng: ${lng} },`);
}

lines.push('];');

fs.writeFileSync(__dirname + '/lib/nes-ziona-streets.ts', lines.join('\n'), 'utf8');

console.log(`Matched: ${matched}/${streets.length}`);
if (missing.length > 0) {
  console.log(`Missing (${missing.length}):`);
  missing.forEach(n => console.log('  -', n));
}
