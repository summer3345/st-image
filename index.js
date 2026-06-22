
import { getContext } from "../../../script.js";

let ctx;
const EXT_ID="cg-generator";

const state={configs:[],current:null,auto:false};

document.addEventListener("APP_READY", async ()=>{
 ctx=getContext();
 loadSettings();
 createUI();
 hookMessages();
 restoreImages();
});

/* settings */
function loadSettings(){
 const d=ctx.extensionSettings[EXT_ID]||{};
 Object.assign(state,d);
}
function saveSettings(){
 ctx.extensionSettings[EXT_ID]=state;
 ctx.saveSettingsDebounced();
}

/* UI (FIXED FRAMEWORK) */
function createUI(){
 const html=`
 <div class="inline-drawer">
   <div class="inline-drawer-toggle inline-drawer-header">
     <b>🎨 CG Generator</b>
     <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
   </div>

   <div class="inline-drawer-content">

     <div style="margin-bottom:10px;">
       <label class="checkbox_label">
         <input type="checkbox" id="cg-auto" ${state.auto?'checked':''}>
         <span>Auto Generate</span>
       </label>
     </div>

     <div id="cg-configs"></div>
     <button id="cg-add" class="menu_button">+ Add Config</button>

   </div>
 </div>
 `;
 $("#extensions_settings2").append(html);

 $(".inline-drawer-toggle").on("click", function () {
   $(this).parent().toggleClass("inline-drawer-expanded");
 });

 $("#cg-auto").on("change",function(){
   state.auto=this.checked;
   saveSettings();
 });

 $("#cg-add").on("click",addConfig);

 renderConfigs();
}

function renderConfigs(){
 const wrap=$("#cg-configs").empty();

 state.configs.forEach((c,i)=>{
  const el=$(`
  <div style="border:1px solid #444;padding:6px;margin-bottom:6px;">
   <input placeholder="Name" value="${c.name||""}">
   <input placeholder="URL" value="${c.url||""}">
   <input placeholder="KEY" value="${c.key||""}">
   <input placeholder="Model" value="${c.model||""}">
   <input placeholder="Size" value="${c.size||"1024x1024"}">
   <select>
     <option value="images" ${c.type==="images"?"selected":""}>Images</option>
     <option value="chat" ${c.type==="chat"?"selected":""}>Chat</option>
   </select>
   <button class="menu_button use">Use</button>
   <button class="menu_button del">Del</button>
  </div>`);

  el.find("input").each((idx,input)=>{
    const keys=["name","url","key","model","size"];
    $(input).on("change",()=>{c[keys[idx]]=input.value;saveSettings();});
  });

  el.find("select").on("change",function(){
    c.type=this.value;saveSettings();
  });

  el.find(".use").on("click",()=>{state.current=i;saveSettings();});
  el.find(".del").on("click",()=>{state.configs.splice(i,1);saveSettings();renderConfigs();});

  wrap.append(el);
 });
}

function addConfig(){
 state.configs.push({name:"",url:"",key:"",model:"",size:"1024x1024",type:"images"});
 saveSettings();
 renderConfigs();
}

/* messages */
function hookMessages(){
 new MutationObserver(processMessages).observe(document.body,{childList:true,subtree:true});
}

function processMessages(){
 $(".mes").each(function(){
  const mes=$(this);
  if(mes.data("cg-processed")) return;

  const textEl=mes.find(".mes_text");
  const text=textEl.text();

  const matches=[...text.matchAll(/image###(.*?)###/g)];
  if(!matches.length) return;

  mes.data("cg-processed",true);
  textEl.empty();

  const wrap=$('<div class="cg-images"></div>');

  matches.forEach(m=>{
    const prompt=m[1];
    const btn=$('<div class="cg-btn">CG</div>');
    btn.on("click",()=>generate(prompt,wrap,btn,mes));
    textEl.append(btn);

    if(state.auto){
      setTimeout(()=>generate(prompt,wrap,btn,mes),100);
    }
  });

  textEl.append(wrap);
 });
}

/* generate */
async function generate(prompt,wrap,btn,mes){
 const cfg=state.configs[state.current];
 if(!cfg) return alert("No config");

 btn.html('<div class="cg-spinner"></div>');

 try{
  const res=await fetch(cfg.url,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+cfg.key
    },
    body:JSON.stringify(buildBody(cfg,prompt))
  });

  const data=await res.json();
  const urls=parseImages(data);

  urls.forEach(u=>appendImage(u,wrap,mes));

 }catch(e){console.error(e);}

 btn.text("CG");
}

function buildBody(cfg,prompt){
 if(cfg.type==="chat"){
  return {model:cfg.model,messages:[{role:"user",content:prompt}]};
 }
 return {model:cfg.model,prompt,size:cfg.size};
}

function parseImages(data){
 const out=[];
 if(data.data){
   data.data.forEach(i=>{
     if(i.url) out.push(i.url);
     if(i.b64_json) out.push("data:image/png;base64,"+i.b64_json);
   });
 }
 return out;
}

/* image */
function appendImage(url,wrap,mes){
 const img=$(`<img src="${url}">`);
 img.on("click",()=>openModal(url,img,mes));
 wrap.append(img);
 saveImage(mes,url);
}

function openModal(url,imgEl,mes){
 let scale=1;

 const modal=$(`
 <div class="cg-modal">
  <div>
   <img src="${url}">
   <div class="cg-modal-actions">
    <button class="menu_button d">Download</button>
    <button class="menu_button x">Delete</button>
   </div>
  </div>
 </div>`);

 const img=modal.find("img");

 img.on("wheel",e=>{
  e.preventDefault();
  scale+=e.originalEvent.deltaY*-0.001;
  scale=Math.min(Math.max(.5,scale),3);
  img.css("transform",`scale(${scale})`);
 });

 modal.on("click",e=>{if(e.target===modal[0]) modal.remove();});
 $(document).on("keydown.cg",e=>{if(e.key==="Escape") modal.remove();});

 modal.find(".d").on("click",()=>{
  const a=document.createElement("a");
  a.href=url;a.download="cg.png";a.click();
 });

 modal.find(".x").on("click",()=>{
  imgEl.remove();
  removeImage(mes,url);
  modal.remove();
 });

 $("body").append(modal);
}

/* storage */
function saveImage(mes,url){
 const id=mes.attr("mesid");
 const message=ctx.chat[id];
 message.extra=message.extra||{};
 message.extra.cgImages=message.extra.cgImages||[];
 message.extra.cgImages.push({url,time:Date.now()});
 ctx.saveChatDebounced();
}

function removeImage(mes,url){
 const id=mes.attr("mesid");
 const message=ctx.chat[id];
 message.extra.cgImages=message.extra.cgImages.filter(i=>i.url!==url);
 ctx.saveChatDebounced();
}

function restoreImages(){
 ctx.chat.forEach((m,i)=>{
  if(!m.extra||!m.extra.cgImages) return;
  const mes=$(`.mes[mesid="${i}"]`);
  const wrap=mes.find(".cg-images");
  if(!wrap.length) return;
  m.extra.cgImages.forEach(i=>appendImage(i.url,wrap,mes));
 });
}
