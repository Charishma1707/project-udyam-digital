const test = require('node:test');
const assert = require('node:assert/strict');
const STTCleaner = require('../node-src/services/sttCleaner');

test('STTCleaner replaces slash and hyphen with natural words', () => {
  const raw1 = 'Airtel Business Internet/CCTV';
  assert.equal(STTCleaner.clean(raw1), 'Airtel Business Internet and CCTV');

  const raw2 = 'Internet-WiFi';
  assert.equal(STTCleaner.clean(raw2), 'Internet WiFi');

  const raw3 = 'We need broadband slash WiFi and cloud hyphen backup';
  assert.equal(STTCleaner.clean(raw3), 'We need broadband and WiFi and cloud backup');
});

test('STTCleaner strictly preserves GSTIN and UDYAM identifiers', () => {
  const rawGstin = 'My GSTIN is 32TTNXB7384T1ZW and we need internet/cctv';
  const cleanedGstin = STTCleaner.clean(rawGstin);
  assert(cleanedGstin.includes('32TTNXB7384T1ZW'));
  assert(cleanedGstin.includes('internet and cctv'));

  const rawUdyam = 'Registered under UDYAM-KL-00-3078801 for retail-services';
  const cleanedUdyam = STTCleaner.clean(rawUdyam);
  assert(cleanedUdyam.includes('UDYAM-KL-00-3078801'));
  assert(cleanedUdyam.includes('retail services'));
});
