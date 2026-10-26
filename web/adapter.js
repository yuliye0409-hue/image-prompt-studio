const listeners = [];
const memory = {};
const handlers = [];
const settingsKey = 'imagePromptStudioSettings';
const storage = {
  async get(key, callback) {
    let value;
    try { value = JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key) || 'null'); } catch {}
    const result = { [key]: memory[key] ?? value };
    callback?.(result);
    return result;
  },
  async set(values) {
    const changes = {};
    for (const [key, value] of Object.entries(values)) {
      changes[key] = { oldValue: memory[key], newValue: value };
      memory[key] = value;
      try {
        if (key === settingsKey) {
          sessionStorage.setItem(key, JSON.stringify(value));
          localStorage.setItem(key, JSON.stringify({ ...value, apiKey: '' }));
        }
      } catch {}
    }
    listeners.forEach(listener => listener(changes, 'local'));
  }
};
window.chrome = {
  storage: { local: storage, onChanged: { addListener: listener => listeners.push(listener) } },
  contextMenus: { create() {}, onClicked: { addListener() {} } },
  sidePanel: { setPanelBehavior: async () => {} },
  runtime: {
    onInstalled: { addListener() {} }, onStartup: { addListener() {} },
    onMessage: { addListener: handler => handlers.push(handler) },
    openOptionsPage() { window.open('options.html', '_blank', 'noopener'); },
    sendMessage(message, callback) {
      for (const handler of handlers) if (handler(message, {}, callback)) return;
      callback?.({ ok: false, error: { message: '操作不可用于网页版' } });
    }
  }
};
window.addEventListener('storage', async event => {
  if (event.key === settingsKey) {
    const result = await storage.get(settingsKey);
    const saved = JSON.parse(event.newValue || '{}');
    memory[settingsKey] = { ...saved, apiKey: result[settingsKey]?.apiKey || '' };
  }
});
await import('./background.js');
// API keys stay in this tab session; settings opened in another tab notify the opener.
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('ips-settings') : null;
const originalSet = storage.set.bind(storage);
storage.set = async values => {
  await originalSet(values);
  if (values[settingsKey]) channel?.postMessage(values[settingsKey]);
};
if (channel) channel.onmessage = async event => {
  if (event.data && typeof event.data === 'object') await originalSet({ [settingsKey]: event.data });
};
