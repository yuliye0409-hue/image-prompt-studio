(() => {
  if (document.getElementById("ips-hover-host")) return;
  const host = document.createElement("div");
  host.id = "ips-hover-host";
  host.style.cssText = "position:fixed;z-index:2147483647;display:none";
  const root = host.attachShadow({mode:"closed"});
  root.innerHTML = `<style>*{box-sizing:border-box}section{font:13px/1.5 system-ui;color:#eee;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:18px;background:rgba(25,28,32,.96);backdrop-filter:blur(28px);border:1px solid #ffffff35;border-radius:8px;box-shadow:0 20px 70px #0008}header,.row{display:flex;gap:8px;justify-content:space-between}label{display:grid;gap:6px;margin:12px 0}select,input,textarea,button{font:inherit;color:#eee;background:#121519;border:1px solid #ffffff30;border-radius:6px;padding:9px}select,input,textarea{width:100%}textarea{resize:vertical}.row button{flex:1}button{cursor:pointer}button:disabled{opacity:.5}#status{white-space:pre-wrap;overflow-wrap:anywhere}#generate{background:#bce9d8;color:#152a23}[hidden]{display:none!important}</style><section role="dialog" aria-label="网页图片提示词"><header><strong>Image Prompt Studio</strong><button id="close" aria-label="关闭">×</button></header><label>提示词逻辑<select id="logic"><option value="universal">通用图生文</option><option value="productAppearance">产品外观分析</option><option value="localizedMarketing">本地化营销排版</option></select></label><div id="marketing" hidden><label>目标市场<input id="market" maxlength="120"></label><label>产品 / 卖点<textarea id="points" rows="2" maxlength="600"></textarea></label></div><div class="row"><button id="generate">生成此图提示词</button><button id="stop" disabled>结束进程</button></div><p id="status" role="status">准备就绪</p><label>提示词<textarea id="output" rows="7"></textarea></label><div class="row"><button id="copy">复制</button><button id="paste">粘贴</button><button id="settings">设置</button></div></section>`;
  document.documentElement.append(host);
  root.innerHTML += `<style>
    :host{color-scheme:dark;--ink:#f5f5f7;--muted:#aeb5c0;--accent:#c0eedf}
    *{letter-spacing:0}section{padding:20px;width:min(408px,calc(100vw - 24px));color:var(--ink);background:rgba(30,33,39,.69);backdrop-filter:blur(36px) saturate(150%);-webkit-backdrop-filter:blur(36px) saturate(150%);border:1px solid rgba(255,255,255,.24);border-radius:8px;box-shadow:0 24px 70px #0006,0 4px 16px #0003,inset 0 1px 0 #ffffff24;scrollbar-width:thin;scrollbar-color:#ffffff32 transparent;overscroll-behavior:contain}
    header{align-items:center;margin:-2px 0 18px;padding-bottom:14px;border-bottom:1px solid #ffffff14}header strong{font-size:14px;font-weight:650;line-height:1.3}header strong::before{content:"IMAGE WORKSPACE";display:block;font-size:9px;font-weight:500;color:var(--accent);margin-bottom:5px}
    label{font-size:12px;color:#d1d6df;gap:8px;margin:14px 0}input,select,textarea{background:rgba(12,15,20,.35);border:1px solid #ffffff17;box-shadow:inset 0 1px 3px #0002;color:var(--ink);outline:none;transition:border-color .16s,background .16s,box-shadow .16s}select{min-height:42px;cursor:pointer}select option{background:#25292f;color:#fff}textarea{line-height:1.7;min-height:70px}#output{min-height:165px;font-size:13px;padding:12px}
    input:hover,select:hover,textarea:hover{border-color:#ffffff35;background:rgba(12,15,20,.48)}input:focus,select:focus,textarea:focus{border-color:#bce9d89c;box-shadow:0 0 0 3px #bce9d81c;background:rgba(12,15,20,.5)}button{min-height:36px;outline:none;background:#ffffff0d;border-color:#ffffff1a;box-shadow:inset 0 1px 0 #ffffff0b;transition:background .16s,transform .16s,border-color .16s,box-shadow .16s}button:not(:disabled):hover{background:#ffffff1b;border-color:#ffffff36}button:not(:disabled):active{transform:scale(.97);background:#ffffff25}button:focus-visible{outline:2px solid #bce9d8;outline-offset:3px}button:disabled{opacity:.35;cursor:default}
    #generate{font-weight:600;background:#c1ebde;color:#152c24;border-color:#daf9ee;box-shadow:0 2px 8px #0002,inset 0 1px 0 #fff8}#generate:not(:disabled):hover{background:#d4f5e9;box-shadow:0 3px 14px #bce9d820}#close{width:30px;min-height:30px;padding:0;font-size:20px;color:#bfc5cd;background:#ffffff09}#close:hover{color:#fff}
    #status{display:flex;align-items:center;gap:8px;min-height:32px;margin:10px 0 2px;font-size:11px;color:#b4c1cc}#status::before{content:"";width:6px;height:6px;flex:0 0 6px;border-radius:50%;background:#a0adbc}#status[data-state=busy]::before{width:10px;height:10px;flex-basis:10px;border:1.5px solid #c0eedf35;border-top-color:#c0eedf;background:transparent;animation:ips-spin .8s linear infinite}#status[data-state=success]::before{background:#97d9bd}#status[data-state=error]::before{background:#f0b19d}#status[data-state=error]{color:#f0b9a9}
    .hold-row{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:-7px 0 12px;font-size:11px;color:var(--muted)}.hold-row input{appearance:auto;accent-color:#bce9d8;width:14px;height:14px;margin:0;cursor:pointer;box-shadow:none} .row{gap:8px} .row button{font-size:12px;padding:9px 8px}
    @keyframes ips-spin{to{transform:rotate(360deg)}}@supports not (backdrop-filter:blur(1px)){section{background:rgba(30,33,39,.96)}}@media(prefers-reduced-transparency:reduce){section{background:#20242a;backdrop-filter:none}}@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
  </style><label class="hold-row"><input id="hold" type="checkbox">保持打开</label>`;
  const holdRow = root.getElementById("hold").parentElement;
  root.querySelector("header").after(holdRow);
  const $ = id => root.getElementById(id);
  const HOVER_KEY = "imagePromptStudioHover";
  let hoverAllowed = false;
  function applyHoverPolicy(value = {}) {
    hoverAllowed = value.enabled !== false && !(value.blockedHosts || []).includes(location.hostname.toLowerCase());
    if (!hoverAllowed) { clearTimeout(timer); clearTimeout(leaveTimer); host.style.display = "none"; launcher.style.display = "none"; candidate = null; }
  }
  const disableSite = document.createElement("button");
  disableSite.textContent = "关闭当前网站悬浮窗";
  disableSite.style.cssText = "width:100%;margin-top:12px;font-size:11px;color:#b8c1cd";
  root.querySelector("section").append(disableSite);
  disableSite.onclick = async () => {
    try {
      const current = (await chrome.storage.local.get(HOVER_KEY))[HOVER_KEY] || {};
      const next = { ...current, blockedHosts: [...new Set([...(current.blockedHosts || []), location.hostname.toLowerCase()])] };
      await chrome.storage.local.set({ [HOVER_KEY]: next }); applyHoverPolicy(next);
    } catch { feedback("保存失败，请在扩展设置中重试。","error"); }
  };
  const originalLabel = $("output").parentElement;
  const languageAreas = document.createElement("div");
  languageAreas.innerHTML = `<style>.language-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:14px 0 7px;color:#d1d6df;font-size:12px}.language-head button{min-height:28px;padding:4px 9px;font-size:11px}.language-output{min-height:120px;line-height:1.7;padding:12px}details{margin-top:12px}summary{cursor:pointer;color:#aeb5c0;font-size:11px}summary:hover{color:#fff}</style><div class="language-head"><label for="outputZh">中文提示词</label><button id="copyZh">复制中文</button></div><textarea class="language-output" id="outputZh" aria-label="中文提示词" rows="5"></textarea><div class="language-head"><label for="outputEn">English Prompt</label><button id="copyEn">复制英文</button></div><textarea class="language-output" id="outputEn" aria-label="英文提示词" rows="5"></textarea>`;
  originalLabel.before(languageAreas);
  originalLabel.hidden = true;
  $("copy").hidden = true;
  function splitResult(text) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\\n/g, "\n")
      .replace(/(?:\*\*|【|\[|#{1,6})\s*((?:中文|英文|Chinese|English)(?:\s*(?:Prompt|提示词|版|Version))?)\s*(?:】|\]|\*\*)\s*[:：]?/gi, "\n$1：");
    const lines = normalized.split("\n");
    const blocks = { zh: [], en: [] };
    const unassigned = [];
    let language = null;
    for (const line of lines) {
      const heading = line.replace(/^[\s#>*\d.、)（(\-]+/, "").replace(/\*\*/g, "").trim();
      const match = heading.match(/^(中文|英文|Chinese|English)(?:\s*(?:Prompt|提示词|版|Version))?\s*(?:[:：]\s*(.*)|$)/i);
      if (match) {
        language = /^(中文|Chinese)/i.test(match[1]) ? "zh" : "en";
        if (match[2]) blocks[language].push(match[2]);
      } else if (/^(?:图片\s*\d|Image\s*\d|统一排版系统|文案本地化重构|最终选定|辅助小字|排版视觉规划|排版适配)/i.test(heading)) language = null;
      else if (language) blocks[language].push(line);
      else unassigned.push(line);
    }
    // Route unlabelled paragraphs by their actual language; never place English in Chinese by default.
    function classify(value) {
      const chinese = (value.match(/[\u3400-\u9fff]/g) || []).length;
      const latin = (value.match(/[a-z]/gi) || []).length;
      if (!chinese && latin > 0) return "en";
      if (chinese > 0 && chinese * 4 >= latin) return "zh";
      return null;
    }
    const result = { zh: "", en: "" };
    for (const key of ["zh", "en"]) {
      const value = blocks[key].join("\n").trim();
      if (value) { const actual = classify(value) || key; result[actual] += (result[actual] ? "\n\n" : "") + value; }
    }
    if (!result.zh || !result.en) {
      for (const paragraph of unassigned.join("\n").split(/\n\s*\n/)) {
        const value = paragraph.trim(), actual = classify(value);
        if (value && actual) result[actual] += (result[actual] ? "\n\n" : "") + value;
      }
    }
    return result;
  }
  function showLanguages(text) {
    if (/(?:Skill naming:|Plugin-provided MCP|<plugins_instructions>|"(?:output_tokens_details|input_tokens_details|web_search|usage)"\s*:)/i.test(text)) {
      $("outputZh").value = ""; $("outputEn").value = "";
      feedback("已拦截异常接口内容，请重新生成；持续出现请检查API服务商。","error");
      return false;
    }
    const parts = splitResult(text);
    $("outputZh").value = parts.zh; $("outputEn").value = parts.en;
    if (text && !parts.zh && !parts.en) {
      feedback("返回内容无法识别为中英文提示词，请重新生成。","error");
    } else if (text && (!parts.zh || !parts.en)) feedback("本次仅返回或识别到" + (parts.zh ? "中文" : "英文") + "提示词，请重新生成补齐另一语言。","error");
    return true;
  }
  async function copyLanguage(id, name) {
    const field = $(id);
    if (!field.value.trim()) { feedback(name + "提示词为空"); return; }
    try { await navigator.clipboard.writeText(field.value); feedback("已复制" + name); finishInteraction(); }
    catch { field.focus(); field.select(); feedback("请使用系统复制命令"); }
  }
  $("copyZh").onclick = () => copyLanguage("outputZh", "中文");
  $("copyEn").onclick = () => copyLanguage("outputEn", "英文");
  $("outputZh").oninput = () => remember();
  $("outputEn").oninput = () => remember();
  const cache = new Map();
  const HOVER_DELAY_MS = 700;
  const LEAVE_DELAY_MS = 2500;
  let engaged = false;
  let image, source, timer, leaveTimer, busy = false, jobId, motion, visibilityEpoch = 0, closing = false, dismissedImage = null;
  function finishInteraction() {
    dismissedImage = image;
    clearTimeout(timer); clearTimeout(leaveTimer);
    launcher.style.display = "none";
    closePanel();
  }
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  function closePanel() {
    remember();
    clearTimeout(timer); clearTimeout(leaveTimer);
    engaged = false;
    closing = true;
    const epoch = ++visibilityEpoch;
    motion?.cancel();
    if (reducedMotion() || !host.animate) { host.style.display = "none"; return; }
    motion = host.animate([{opacity:1,transform:"translateY(0) scale(1)"},{opacity:0,transform:"translateY(8px) scale(.82)"}],{duration:180,easing:"cubic-bezier(.4,0,1,1)"});
    motion.finished.then(() => { if(epoch === visibilityEpoch) host.style.display = "none"; }).catch(() => {});
  }
  function feedback(text, state = "idle") { $("status").textContent = text; $("status").dataset.state = state; }
  function remember() { if(source) cache.set(source, {text:$("output").value,zh:$("outputZh").value,en:$("outputEn").value,logic:$("logic").value,market:$("market").value,points:$("points").value}); if(cache.size>30) cache.delete(cache.keys().next().value); }
  function position() {
    if(!image?.isConnected || host.style.display === "none") return;
    const r=image.getBoundingClientRect(), width=Math.min(408,innerWidth-24);
    const height = host.getBoundingClientRect().height;
    const left=r.right+width+12<innerWidth?r.right+10:r.left-width-10;
    host.style.left=Math.max(12,Math.min(left,innerWidth-width-12))+"px";
    host.style.top=Math.max(12,Math.min(r.top,innerHeight-height-12))+"px";
  }
  function playOpenAnimation(target, previousPosition) {
    if (reducedMotion() || !host.animate) return;
    motion?.cancel();
    const rect = target.getBoundingClientRect();
    host.style.transformOrigin = (rect.left > parseFloat(host.style.left) ? "right" : "left") + " top";
    const dx = previousPosition ? previousPosition.left - parseFloat(host.style.left) : 0;
    const dy = previousPosition ? previousPosition.top - parseFloat(host.style.top) : 8;
    host.style.willChange = "transform, opacity";
    motion = host.animate([{opacity:previousPosition ? .8 : 0,transform:`translate3d(${dx}px,${dy}px,0) scale(${previousPosition ? .97 : .86})`},{opacity:1,transform:"translate3d(0,0,0) scale(1)"}],{duration:260,easing:"cubic-bezier(.22,.61,.36,1)"});
    const currentMotion = motion;
    motion.finished.then(() => { if (motion === currentMotion) host.style.willChange = "auto"; }).catch(() => {});
  }
  function open(target, replay = false) {
    if (!hoverAllowed) return;
    if(busy && target!==image) return;
    if ($("hold").checked && host.style.display !== "none" && target !== image) return;
    if (target === image && host.style.display !== "none" && !closing) { clearTimeout(leaveTimer); if (replay && !busy) playOpenAnimation(target); return; }
    const previousPosition = host.style.display !== "none" && target !== image ? {left:parseFloat(host.style.left),top:parseFloat(host.style.top)} : null;
    ++visibilityEpoch; motion?.cancel();
    closing = false;
    remember(); image=target; source=target.currentSrc||target.src;
    const saved=cache.get(source);
    $("output").value=saved?.text||""; $("logic").value=saved?.logic||"universal";
    if (!busy) feedback(saved?.text ? "已恢复此图的提示词" : "准备就绪");
    const valid = showLanguages(saved?.text || "");
    if (saved && valid) { $("outputZh").value = saved.zh ?? $("outputZh").value; $("outputEn").value = saved.en ?? $("outputEn").value; }
    if (!valid) { cache.delete(source); $("output").value = ""; }
    $("market").value=saved?.market||""; $("points").value=saved?.points||"";
    $("marketing").hidden=$("logic").value!=="localizedMarketing";
    host.style.display="block"; position();
    playOpenAnimation(target, previousPosition);
  }
  const launcher = document.createElement("button");
  launcher.textContent = "↗";
  launcher.title = "打开图片提示词";
  launcher.setAttribute("aria-label", "打开图片提示词");
  launcher.style.cssText = "all:initial;position:fixed;display:none;z-index:2147483647;width:34px;height:34px;border:1px solid #ffffff50;border-radius:8px;background:rgba(34,43,43,.72);backdrop-filter:blur(18px);color:#d8f7eb;text-align:center;font:22px/34px system-ui;cursor:pointer;box-shadow:0 4px 16px #0004;transition:background .16s,transform .16s";
  document.documentElement.append(launcher);
  launcher.onclick = () => { if (candidate) open(candidate, true); };
  // Resolve images beneath site overlays instead of relying on event.target.
  let candidate = null;
  function detectImage(event) {
    if (!hoverAllowed) return;
    if (event.target === host || event.composedPath().includes(host) || event.target === launcher) { clearTimeout(leaveTimer); return; }
    const stack = document.elementsFromPoint(event.clientX, event.clientY);
    let target = stack.find(node => node instanceof HTMLImageElement);
    if (!target) {
      const container = event.target.closest?.("a, [data-test-id=pin], [role=listitem], figure");
      target = container?.querySelector("img");
      if (target) { const r = target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) target = null; }
    }
    if (target) { const r = target.getBoundingClientRect(); if (r.width < 64 || r.height < 64) target = null; }
    if (dismissedImage && target === dismissedImage) return;
    if (target !== dismissedImage) dismissedImage = null;
    if (target === candidate) { if (target) clearTimeout(leaveTimer); return; }
    candidate = target; clearTimeout(timer);
    if (target) {
      clearTimeout(leaveTimer);
      const rect = target.getBoundingClientRect();
      launcher.style.display = "block";
      launcher.style.left = Math.max(4, Math.min(innerWidth - 38, rect.left + 8)) + "px";
      launcher.style.top = Math.max(4, Math.min(innerHeight - 38, rect.top + 8)) + "px";
      timer = setTimeout(() => { if (candidate === target && target.isConnected) open(target, true); }, HOVER_DELAY_MS);
    } else {
      launcher.style.display = "none";
      leaveTimer = setTimeout(() => { if (!host.matches(":hover") && !root.activeElement && !busy && !engaged && !$("hold").checked) closePanel(); }, LEAVE_DELAY_MS);
    }
  }
  document.addEventListener("pointerover", detectImage, true);
  let pointerFrame = null, latestPointerEvent;
  document.addEventListener("pointermove", event => {
    if (!window.requestAnimationFrame) { detectImage(event); return; }
    latestPointerEvent = event;
    if (pointerFrame !== null) return;
    pointerFrame = window.requestAnimationFrame(() => { pointerFrame = null; detectImage(latestPointerEvent); });
  }, true);
  function engage() { engaged = true; clearTimeout(timer); clearTimeout(leaveTimer); }
  host.addEventListener("pointerenter", engage);
  root.addEventListener("focusin", engage);
  root.addEventListener("pointerdown", engage);
  $("close").onclick=closePanel;
  root.addEventListener("keydown",event=>{if(event.key==="Escape") $("close").click();});
  window.addEventListener("resize",position); window.addEventListener("scroll",position,{passive:true});
  $("logic").onchange=()=>{$("marketing").hidden=$("logic").value!=="localizedMarketing";position();};
  function send(message) {return new Promise((resolve,reject)=>{try{chrome.runtime.sendMessage(message,response=>{if(chrome.runtime.lastError) reject(new Error("扩展连接失效，请刷新当前网页。"));else if(!response?.ok) reject(new Error(response?.error?.message||"操作失败"));else resolve(response);});}catch{reject(new Error("请刷新当前网页后重试。"));}});}
  async function getInput(){
    if(!source.startsWith("blob:")) return {sourceUrl:source};
    const blob=await(await fetch(source)).blob(); if(blob.size>20*1024*1024) throw new Error("图片超过20MB，请下载压缩后使用。");
    const url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    return {images:[{mimeType:blob.type,data:url.split(",")[1]}]};
  }
  $("generate").onclick=async()=>{
    if(busy||!source)return; busy=true;jobId=null;$("generate").disabled=true;$("stop").disabled=false;$("logic").disabled=true;feedback("正在读取图片…","busy");
    try{const input=await getInput();const response=await send({type:"startAnalysis",...input,sourceType:"pageHover",promptStyle:$("logic").value,promptContext:{targetMarket:$("market").value,sellingPoints:$("points").value}});$("output").value=typeof response.result==="string"?response.result:"";feedback("生成完成","success");showLanguages($("output").value);remember();}
    catch(error){feedback(error.message,"error");}finally{busy=false;$("generate").disabled=false;$("stop").disabled=true;$("logic").disabled=false; if($("status").textContent === "生成完成") feedback("生成完成","success");}
  };
  chrome.storage.onChanged.addListener((changes,area)=>{const job=changes.imagePromptStudioLastResult?.newValue;if(!busy||area!=="local"||!job||job.sourceType!=="pageHover"||job.source!==source)return;if(!jobId)jobId=job.id;if(job.id===jobId)$("status").textContent=(job.title||"处理中")+" · "+(job.progress||0)+"%";});
  $("stop").onclick=()=>{if(jobId)send({type:"cancelAnalysis",jobId}).catch(error=>{$("status").textContent=error.message;});else $("status").textContent="正在读取图片，请等待任务建立后再结束。";};
  $("settings").onclick=()=>send({type:"openSettings"}).catch(error=>{$("status").textContent=error.message;});
  $("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("output").value);$("status").textContent="已复制";finishInteraction();}catch{$("output").focus();$("output").select();$("status").textContent="请使用系统复制命令";}};
  $("output").oninput = () => { showLanguages($("output").value); remember(); };
  $("copy").textContent = "复制完整结果";
  $("paste").onclick=async()=>{try{$("output").value=await navigator.clipboard.readText();showLanguages($("output").value);remember();}catch{$("outputZh").focus();$("status").textContent="请在中文或英文文本框内使用系统粘贴命令";}};
  chrome.storage.local.get(HOVER_KEY).then(stored => applyHoverPolicy(stored[HOVER_KEY])).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes[HOVER_KEY]) applyHoverPolicy(changes[HOVER_KEY].newValue); });
})();
