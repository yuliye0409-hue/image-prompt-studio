const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const elements = new Map();
const events = {};
const messages = [];
const element = () => ({value:"",style:{},dataset:{},checked:false,parentElement:{before(){}},append(){},disabled:false,hidden:false,setAttribute(){},focus(){},select(){},getBoundingClientRect(){return {height:400};}});
const root = {getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},querySelector(){return {after(){}};},addEventListener(){}};
const hostEvents = {};
const host = {...element(),attachShadow(){return root;},addEventListener(name,fn){hostEvents[name]=fn;},matches(){return false;}};
class Image {constructor(){this.src="https://example.com/product.jpg";this.isConnected=true;}getBoundingClientRect(){return {width:200,height:200,left:30,right:230,top:50};}}
let hover, leave;
let hit = new Image();
const context = {document:{getElementById(){return null;},elementsFromPoint(){return hit ? [hit] : [];},createElement(tag){return tag === "button" ? element() : host;},documentElement:{append(){}},addEventListener(name,fn){events[name]=fn;}},window:{addEventListener(){}},HTMLImageElement:Image,innerWidth:1200,innerHeight:900,setTimeout(fn,ms){if(ms===1200)hover=fn;if(ms===2500)leave=fn;return 1;},clearTimeout(){},navigator:{clipboard:{async writeText(){},async readText(){return "pasted";}}},chrome:{runtime:{sendMessage(message,callback){messages.push(message);callback({ok:true,result:"中文 Prompt / English Prompt"});}},storage:{onChanged:{addListener(){}}}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync("src/image-hover.js","utf8"),context);
(async()=>{
  events.pointerover({target:hit,clientX:100,clientY:100,composedPath(){return [];}});
  assert.equal(typeof hover,"function"); hover();
  assert.equal(host.style.display,"block");
  hostEvents.pointerenter();
  hit = null;
  events.pointermove({target:{closest(){return null;}},clientX:100,clientY:100,composedPath(){return [];}});
  leave(); assert.equal(host.style.display,"block");
  elements.get("logic").value="productAppearance";
  await elements.get("generate").onclick();
  assert.equal(messages[0].sourceUrl,"https://example.com/product.jpg");
  assert.equal(messages[0].promptStyle,"productAppearance");
  assert.equal(elements.get("output").value,"中文 Prompt / English Prompt");
  elements.get("output").value = "### 中文 Prompt：\n黑色金属产品，纯净留白。\n### English Prompt:\nBlack metal product, clean negative space.";
  elements.get("output").oninput();
  assert.equal(elements.get("outputZh").value, "黑色金属产品，纯净留白。");
  assert.equal(elements.get("outputEn").value, "Black metal product, clean negative space.");
  for (const text of [
    "【中文提示词】黑色金属产品。\n【英文提示词】Black metal product.",
    "**中文 Prompt：**\n黑色金属产品。\n**English Prompt：**\nBlack metal product.",
    "中文版：黑色金属产品。\nEnglish Version: Black metal product."
  ]) {
    elements.get("output").value = text; elements.get("output").oninput();
    assert.equal(elements.get("outputZh").value, "黑色金属产品。");
    assert.equal(elements.get("outputEn").value, "Black metal product.");
  }
  elements.get("output").value = "Soft cyan light from above. Deep blacks, clean negative space.";
  elements.get("output").oninput();
  assert.equal(elements.get("outputZh").value, "");
  assert.match(elements.get("outputEn").value, /Soft cyan light/);
  assert.match(elements.get("status").textContent, /仅返回或识别到英文/);
  elements.get("output").value = 'Skill naming: unrelated instructions\n{"usage":{"output_tokens_details":{}}}';
  elements.get("output").oninput();
  assert.equal(elements.get("outputZh").value, "");
  assert.equal(elements.get("outputEn").value, "");
  assert.match(elements.get("status").textContent, /已拦截异常接口内容/);
  assert.equal(elements.get("generate").disabled,false);
  elements.get("close").onclick();assert.equal(host.style.display,"none");
  hit = new Image();
  events.pointermove({target:{closest(){return null;}},clientX:100,clientY:100,composedPath(){return [];}});
  hover(); assert.equal(host.style.display,"block");
  elements.get("outputEn").value = "Copy this English prompt.";
  await elements.get("copyEn").onclick();
  assert.equal(host.style.display,"none");
  hover = null;
  events.pointermove({target:hit,clientX:100,clientY:100,composedPath(){return [];}});
  assert.equal(hover,null);
  hit = new Image();
  events.pointermove({target:hit,clientX:100,clientY:100,composedPath(){return [];}});
  hover(); assert.equal(host.style.display,"block");
  context.navigator.clipboard.writeText = async () => { throw new Error("denied"); };
  elements.get("outputZh").value = "中文提示词";
  await elements.get("copyZh").onclick();
  assert.equal(host.style.display,"block");
  const manifest=JSON.parse(fs.readFileSync("manifest.json","utf8"));
  assert(manifest.content_scripts[0].js.includes("src/image-hover.js"));
  console.log("Page-image hover, API message, output, close and manifest checks passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
