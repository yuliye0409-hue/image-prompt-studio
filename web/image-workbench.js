const grid = document.querySelector('#previewGrid');
const panel = document.createElement('section');
panel.className = 'image-popover';
panel.hidden = true;
panel.setAttribute('role', 'dialog');
panel.setAttribute('aria-label', '单图提示词工作台');
panel.innerHTML = `<header class="popover-head"><div><small>IMAGE WORKSPACE</small><h2 id="imageTitle">图片提示词</h2></div><button type="button" data-close aria-label="关闭" title="关闭">×</button></header>
<label>提示词逻辑<select id="imageLogic"><option value="universal">通用图生文</option><option value="productAppearance">产品外观分析</option><option value="localizedMarketing">本地化营销排版</option></select></label>
<div id="imageMarketing" hidden><label>目标市场<input id="imageMarket" maxlength="120" placeholder="美国、日本、欧洲…"></label><label>产品 / 卖点<textarea id="imagePoints" maxlength="600" rows="2"></textarea></label></div>
<div class="popover-actions"><button type="button" data-generate>生成此图提示词</button><button type="button" data-stop disabled>结束进程</button></div>
<p class="popover-status" role="status" aria-live="polite">准备就绪</p><label>提示词<textarea id="imageOutput" rows="8" spellcheck="false"></textarea></label>
<div class="popover-actions"><button type="button" data-copy title="复制提示词">复制</button><button type="button" data-paste title="粘贴剪贴板文本">粘贴</button></div>`;
document.body.append(panel);
const $ = selector => panel.querySelector(selector);
const logic = $('#imageLogic');
const output = $('#imageOutput');
const status = $('.popover-status');
const saved = new Map();
let activeImage = null;
let activeSource = '';
let runningSource = '';
let jobId = null;
let busy = false;
let hoverTimer;
let hideTimer;
function remember() {
  if (activeSource) saved.set(activeSource, { text: output.value, logic: logic.value, market: $('#imageMarket').value, points: $('#imagePoints').value });
}
function position() {
  if (panel.hidden || !activeImage?.isConnected) return;
  const rect = activeImage.getBoundingClientRect();
  const width = Math.min(430, innerWidth - 24);
  panel.style.width = `${width}px`;
  let left = rect.right + 12;
  if (left + width > innerWidth - 12) left = rect.left - width - 12;
  panel.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
  panel.style.top = `${Math.max(12, Math.min(rect.top, innerHeight - Math.min(panel.scrollHeight, innerHeight - 24) - 12))}px`;
}
function open(image, focus = false) {
  if (busy && image.src !== runningSource) return;
  clearTimeout(hideTimer);
  remember();
  activeImage = image;
  activeSource = image.src;
  const value = saved.get(activeSource);
  logic.value = value?.logic || document.querySelector('#promptStyle').value;
  output.value = value?.text || '';
  $('#imageMarket').value = value?.market || document.querySelector('#targetMarket').value;
  $('#imagePoints').value = value?.points || document.querySelector('#sellingPoints').value;
  $('#imageTitle').textContent = image.alt;
  $('#imageMarketing').hidden = logic.value !== 'localizedMarketing';
  panel.hidden = false;
  position();
  if (focus) logic.focus();
}
function close() { remember(); panel.hidden = true; }
grid.addEventListener('pointerover', event => {
  const image = event.target.closest('.preview-item')?.querySelector('img');
  if (!image || event.pointerType === 'touch') return;
  clearTimeout(hideTimer);
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => open(image), 420);
});
grid.addEventListener('pointerout', event => {
  if (grid.contains(event.relatedTarget)) return;
  clearTimeout(hoverTimer);
  hideTimer = setTimeout(() => { if (!panel.matches(':hover') && !panel.contains(document.activeElement) && !busy) close(); }, 650);
});
grid.addEventListener('click', event => {
  if (event.target.closest('button')) return;
  const image = event.target.closest('.preview-item')?.querySelector('img');
  if (image) open(image, true);
});
function enhanceImages() {
  grid.querySelectorAll('.preview-item img').forEach(image => {
    if (image.dataset.workbench) return;
    image.dataset.workbench = 'true';
    image.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => open(image), 420);
    });
    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'image-workbench-open';
    launcher.textContent = '↗';
    launcher.title = '打开单图提示词工作台';
    launcher.setAttribute('aria-label', '打开单图提示词工作台');
    launcher.addEventListener('click', () => open(image, true));
    image.parentElement.append(launcher);
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-haspopup', 'dialog');
    image.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(image, true); }
    });
  });
  if (activeImage && !activeImage.isConnected) close();
}
new MutationObserver(enhanceImages).observe(grid, { childList: true });
enhanceImages();
panel.addEventListener('pointerenter', () => clearTimeout(hideTimer));
$('[data-close]').addEventListener('click', close);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { close(); activeImage?.focus(); } });
document.addEventListener('pointerdown', event => { if (!panel.hidden && !panel.contains(event.target) && !grid.contains(event.target)) close(); });
window.addEventListener('resize', position);
window.addEventListener('scroll', position, { passive: true });
logic.addEventListener('change', () => { $('#imageMarketing').hidden = logic.value !== 'localizedMarketing'; remember(); position(); });
output.addEventListener('input', remember);
function setBusy(value) {
  busy = value;
  $('[data-generate]').disabled = value;
  $('[data-stop]').disabled = !value;
  logic.disabled = value;
}
$('[data-generate]').addEventListener('click', () => {
  if (!activeImage?.isConnected || busy) return;
  const match = activeSource.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) { status.textContent = '图片数据无效，请重新上传。'; return; }
  runningSource = activeSource;
  jobId = null;
  setBusy(true);
  status.textContent = '正在生成…';
  chrome.runtime.sendMessage({ type: 'startAnalysis', images: [{ mimeType: match[1], data: match[2] }], sourceType: 'upload', promptStyle: logic.value, promptContext: { targetMarket: $('#imageMarket').value.trim(), sellingPoints: $('#imagePoints').value.trim() } }, response => {
    setBusy(false);
    if (response?.ok) { output.value = typeof response.result === 'string' ? response.result : ''; status.textContent = output.value ? '生成完成' : '请在下方生成结果中查看输出'; remember(); }
    else status.textContent = response?.error?.message || '生成失败，请重试。';
  });
});
chrome.storage.onChanged.addListener(changes => {
  const job = changes.imagePromptStudioLastResult?.newValue;
  if (!busy || !job) return;
  if (!jobId) jobId = job.id;
  if (job.id !== jobId) return;
  status.textContent = job.status === 'loading' ? `正在生成 · ${job.progress || 0}%` : job.status === 'success' ? '生成完成' : job.error?.message || '任务已结束';
  if (job.status === 'success' && typeof job.result === 'string') { output.value = job.result; remember(); }
});
$('[data-stop]').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'cancelAnalysis', jobId }, response => { if (!response?.ok) status.textContent = response?.error?.message || '无法结束任务'; });
});
$('[data-copy]').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(output.value); status.textContent = '已复制'; }
  catch { output.focus(); output.select(); status.textContent = '请使用系统复制命令复制已选文本'; }
});
$('[data-paste]').addEventListener('click', async () => {
  try { output.value = await navigator.clipboard.readText(); remember(); status.textContent = '已粘贴'; }
  catch { output.focus(); status.textContent = '浏览器未允许读取剪贴板，请在文本框中手动粘贴'; }
});
