(() => {
  if (document.getElementById("ips-hover-host")) return;
  const host = document.createElement("div");
  host.id = "ips-hover-host";
  host.style.cssText = "position:fixed;z-index:2147483647;display:none";
  const root = host.attachShadow({mode:"closed"});
  root.innerHTML = `<style>*{box-sizing:border-box}section{font:13px/1.5 system-ui;color:#eee;width:min(390px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:18px;background:rgba(25,28,32,.96);backdrop-filter:blur(28px);border:1px solid #ffffff35;border-radius:8px;box-shadow:0 20px 70px #0008}header,.row{display:flex;gap:8px;justify-content:space-between}label{display:grid;gap:6px;margin:12px 0}select,input,textarea,button{font:inherit;color:#eee;background:#121519;border:1px solid #ffffff30;border-radius:6px;padding:9px}select,input,textarea{width:100%}textarea{resize:vertical}.row button{flex:1}button{cursor:pointer}button:disabled{opacity:.5}#status{white-space:pre-wrap;overflow-wrap:anywhere}#generate{background:#bce9d8;color:#152a23}[hidden]{display:none!important}</style><section role="dialog" aria-label="网页图片提示词"><header><strong>Image Prompt Studio</strong><button id="close" aria-label="关闭">×</button></header><label>提示词逻辑<select id="logic"><option value="universal">通用图生文</option><option value="productAppearance">产品外观分析</option><option value="localizedMarketing">本地化营销排版</option></select></label><div id="marketing" hidden><label>目标市场<input id="market" maxlength="120"></label><label>产品 / 卖点<textarea id="points" rows="2" maxlength="600"></textarea></label></div><div class="row"><button id="generate">生成此图提示词</button><button id="stop" disabled>结束进程</button></div><p id="status" role="status">准备就绪</p><label>提示词<textarea id="output" rows="7"></textarea></label><div class="row"><button id="copy">复制</button><button id="paste">粘贴</button><button id="settings">设置</button></div></section>`;
  document.documentElement.append(host);
  const $ = id => root.getElementById(id);
  const cache = new Map();
  let image, source, timer, leaveTimer, busy = false, jobId;
  function remember() { if(source) cache.set(source, {text:$("output").value,logic:$("logic").value,market:$("market").value,points:$("points").value}); if(cache.size>30) cache.delete(cache.keys().next().value); }
  function position() {
    if(!image?.isConnected || host.style.display === "none") return;
    const r=image.getBoundingClientRect(), width=Math.min(390,innerWidth-24);
    const left=r.right+width+12<innerWidth?r.right+10:r.left-width-10;
    host.style.left=Math.max(12,Math.min(left,innerWidth-width-12))+"px";
    host.style.top=Math.max(12,Math.min(r.top,innerHeight-host.getBoundingClientRect().height-12))+"px";
  }
  function open(target) {
    if(busy && target!==image) return;
    remember(); image=target; source=target.currentSrc||target.src;
    const saved=cache.get(source);
    $("output").value=saved?.text||""; $("logic").value=saved?.logic||"universal";
    $("market").value=saved?.market||""; $("points").value=saved?.points||"";
    $("marketing").hidden=$("logic").value!=="localizedMarketing";
    host.style.display="block"; position();
  }
  const launcher = document.createElement("button");
  launcher.textContent = "↗";
  launcher.title = "打开图片提示词";
  launcher.setAttribute("aria-label", "打开图片提示词");
  launcher.style.cssText = "all:initial;position:fixed;display:none;z-index:2147483647;width:34px;height:34px;border-radius:6px;background:#bce9d8;color:#152a23;text-align:center;font:22px/34px system-ui;cursor:pointer;box-shadow:0 2px 12px #0006";
  document.documentElement.append(launcher);
  launcher.onclick = () => { if (candidate) open(candidate); };
  // Resolve images beneath site overlays instead of relying on event.target.
  let candidate = null;
  function detectImage(event) {
    if (event.composedPath().includes(host) || event.target === launcher) { clearTimeout(leaveTimer); return; }
    const stack = document.elementsFromPoint(event.clientX, event.clientY);
    let target = stack.find(node => node instanceof HTMLImageElement);
    if (!target) {
      const container = event.target.closest?.("a, [data-test-id=pin], [role=listitem], figure");
      target = container?.querySelector("img");
      if (target) { const r = target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) target = null; }
    }
    if (target) { const r = target.getBoundingClientRect(); if (r.width < 64 || r.height < 64) target = null; }
    if (target === candidate) { if (target) clearTimeout(leaveTimer); return; }
    candidate = target; clearTimeout(timer);
    if (target) {
      clearTimeout(leaveTimer);
      const rect = target.getBoundingClientRect();
      launcher.style.display = "block";
      launcher.style.left = Math.max(4, Math.min(innerWidth - 38, rect.left + 8)) + "px";
      launcher.style.top = Math.max(4, Math.min(innerHeight - 38, rect.top + 8)) + "px";
      timer = setTimeout(() => open(target), 450);
    } else {
      launcher.style.display = "none";
      leaveTimer = setTimeout(() => { if (!host.matches(":hover") && !root.activeElement && !busy) { remember(); host.style.display = "none"; } }, 900);
    }
  }
  document.addEventListener("pointerover", detectImage, true);
  document.addEventListener("pointermove", detectImage, true);
  host.addEventListener("pointerenter",()=>clearTimeout(leaveTimer));
  $("close").onclick=()=>{remember();host.style.display="none";};
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
    if(busy||!source)return; busy=true;jobId=null;$("generate").disabled=true;$("stop").disabled=false;$("logic").disabled=true;$("status").textContent="正在读取图片…";
    try{const input=await getInput();const response=await send({type:"startAnalysis",...input,sourceType:"pageHover",promptStyle:$("logic").value,promptContext:{targetMarket:$("market").value,sellingPoints:$("points").value}});$("output").value=typeof response.result==="string"?response.result:"";$("status").textContent="生成完成";remember();}
    catch(error){$("status").textContent=error.message;}finally{busy=false;$("generate").disabled=false;$("stop").disabled=true;$("logic").disabled=false;}
  };
  chrome.storage.onChanged.addListener((changes,area)=>{const job=changes.imagePromptStudioLastResult?.newValue;if(!busy||area!=="local"||!job||job.sourceType!=="pageHover"||job.source!==source)return;if(!jobId)jobId=job.id;if(job.id===jobId)$("status").textContent=(job.title||"处理中")+" · "+(job.progress||0)+"%";});
  $("stop").onclick=()=>{if(jobId)send({type:"cancelAnalysis",jobId}).catch(error=>{$("status").textContent=error.message;});else $("status").textContent="正在读取图片，请等待任务建立后再结束。";};
  $("settings").onclick=()=>send({type:"openSettings"}).catch(error=>{$("status").textContent=error.message;});
  $("copy").onclick=async()=>{try{await navigator.clipboard.writeText($("output").value);$("status").textContent="已复制";}catch{$("output").focus();$("output").select();$("status").textContent="请使用系统复制命令";}};
  $("paste").onclick=async()=>{try{$("output").value=await navigator.clipboard.readText();remember();}catch{$("output").focus();$("status").textContent="请在文本框内使用系统粘贴命令";}};
})();
