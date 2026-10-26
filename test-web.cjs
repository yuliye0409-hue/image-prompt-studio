const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const persisted = new Map();
const events = {};
const context = {
  window: { addEventListener: (name, handler) => { events[name] = handler; }, open() {} },
  localStorage: { getItem: key => persisted.get(key), setItem: (key, value) => persisted.set(key, value) }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('web/adapter.js', 'utf8').replace("await import('./background.js');", ''), context);
(async () => {
  const storage = context.window.chrome.storage.local;
  const key = 'imagePromptStudioSettings';
  await storage.set({ [key]: { apiKey: 'test-only', model: 'test-model' } });
  assert.equal((await storage.get(key))[key].apiKey, 'test-only');
  assert.equal(JSON.parse(persisted.get(key)).model, 'test-model');
  await events.storage({ key, newValue: JSON.stringify({ apiKey: 'updated-test-key' }) });
  assert.equal((await storage.get(key))[key].apiKey, 'updated-test-key');
  let callbackValue;
  await storage.get(key, result => { callbackValue = result[key]; });
  assert.equal(callbackValue.apiKey, 'updated-test-key');
  for (const file of ['background.js', 'popup.js', 'options.js']) {
    assert.equal(fs.readFileSync(`web/${file}`, 'utf8'), fs.readFileSync(`src/${file}`, 'utf8'));
  }
  assert.match(fs.readFileSync('web/index.html', 'utf8'), /src="app.js\?v=[a-f0-9]+"/);
  console.log('Web adapter, settings synchronization, bootstrap and source parity checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
