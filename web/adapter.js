const listeners = [];
const memory = {};
const handlers = [];
const settingsKey = 'imagePromptStudioSettings';
const storage = {
  async get(key, callback) {
    let value;
    try { value = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
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
        if (key === settingsKey || key === "imagePromptStudioHover") {
          localStorage.setItem(key, JSON.stringify(value));
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
    const saved = JSON.parse(event.newValue || '{}');
    memory[settingsKey] = saved;
    listeners.forEach(listener => listener({ [settingsKey]: { newValue: saved } }, 'local'));
  }
});
await import('./background.js');
