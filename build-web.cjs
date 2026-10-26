const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'web');
fs.mkdirSync(out, { recursive: true });
for (const name of ['popup.css', 'options.css', 'options.js', 'popup.js', 'background.js']) {
  fs.copyFileSync(path.join(__dirname, 'src', name), path.join(out, name));
}
for (const [source, target] of [['panel.html', 'index.html'], ['options.html', 'options.html']]) {
  let html = fs.readFileSync(path.join(__dirname, 'src', source), 'utf8');
  const entry = source === 'panel.html' ? 'popup.js' : 'options.js';
  const bootstrap = source === 'panel.html' ? 'app.js' : 'settings-app.js';
  fs.writeFileSync(path.join(out, bootstrap), `await import('./adapter.js');\nawait import('./${entry}');\n`);
  html = html.replace(`<script src="${entry}" type="module"></script>`, `<script type="module" src="${bootstrap}"></script>`);
  html = html.replace('API Key 会保存在 Chrome 本地扩展存储中', 'API Key 会保存在当前设备的浏览器本地存储中，共用设备请在使用后清空密钥');
  html = html.replace('</head>', '<link rel="stylesheet" href="web.css"><link rel="icon" href="icon.png"></head>');
  html = html.replace('固定插件界面', '图生文提示词').replace('Image Prompt Studio 侧边栏', 'Image Prompt Studio');
  html = html.replace('<button class="icon-button" id="pinPanel"', '<button hidden class="icon-button" id="pinPanel"');
  fs.writeFileSync(path.join(out, target), html);
}
fs.copyFileSync(path.join(__dirname, 'assets/icon-128.png'), path.join(out, 'icon.png'));
