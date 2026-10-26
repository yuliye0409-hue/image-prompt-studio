const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const elements = new Map();
const events = {};
const messages = [];
const element = () => ({value:"",style:{},disabled:false,hidden:false,focus(){},select(){},getBoundingClientRect(){return {height:400};}});
const root = {getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(){}};
const host = {...element(),attachShadow(){return root;},addEventListener(){},matches(){return false;}};
class Image {constructor(){this.src="https://example.com/product.jpg";this.isConnected=true;}getBoundingClientRect(){return {width:200,height:200,left:30,right:230,top:50};}}
let hover;
const context = {document:{createElement(){return host;},documentElement:{append(){}},addEventListener(name,fn){events[name]=fn;}},window:{addEventListener(){}},HTMLImageElement:Image,innerWidth:1200,innerHeight:900,setTimeout(fn,ms){if(ms===500)hover=fn;return 1;},clearTimeout(){},navigator:{clipboard:{async writeText(){},async readText(){return "pasted";}}},chrome:{runtime:{sendMessage(message,callback){messages.push(message);callback({ok:true,result:"中文 Prompt / English Prompt"});}},storage:{onChanged:{addListener(){}}}}};
vm.createContext(context);
vm.runInContext(fs.readFileSync("src/image-hover.js","utf8"),context);
(async()=>{
  events.pointerover({target:new Image()});
  assert.equal(typeof hover,"function"); hover();
  assert.equal(host.style.display,"block");
  elements.get("logic").value="productAppearance";
  await elements.get("generate").onclick();
  assert.equal(messages[0].sourceUrl,"https://example.com/product.jpg");
  assert.equal(messages[0].promptStyle,"productAppearance");
  assert.equal(elements.get("output").value,"中文 Prompt / English Prompt");
  assert.equal(elements.get("generate").disabled,false);
  elements.get("close").onclick();assert.equal(host.style.display,"none");
  const manifest=JSON.parse(fs.readFileSync("manifest.json","utf8"));
  assert(manifest.content_scripts[0].js.includes("src/image-hover.js"));
  console.log("Page-image hover, API message, output, close and manifest checks passed.");
})().catch(error=>{console.error(error);process.exitCode=1;});
