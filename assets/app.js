const statusNode=document.getElementById("runtime-status");
const form=document.getElementById("chat-form");
const input=document.getElementById("chat-input");
const sendButton=document.getElementById("send-button");
const conversation=document.getElementById("conversation");
const runtimeUrlInput=document.getElementById("runtime-url");
const runtimeTokenInput=document.getElementById("runtime-token");
const runtimeModelSelect=document.getElementById("runtime-model");
const connectButton=document.getElementById("connect-runtime");
const runtimeBadge=document.getElementById("runtime-badge");
const chiefStatus=document.getElementById("chief-status");
const executionStatus=document.getElementById("execution-status");
const securityNote=document.getElementById("security-note");

let runtimeBaseUrl="";
let runtimeToken="";
let connected=false;

function setConnectionState(value){
  connected=value;
  statusNode.textContent=value?"المحرك متصل":"المحرك غير متصل";
  runtimeBadge.textContent=value?"RUNTIME ONLINE":"RUNTIME OFFLINE";
  chiefStatus.textContent=value?"النموذج المحلي متصل":"بانتظار الاتصال";
  executionStatus.textContent=value?"جاهز لتنفيذ المهام":"بانتظار الاتصال";
  document.querySelector(".connection-state")?.classList.toggle("is-connected",value);
}

function appendMessage(text,kind="assistant"){
  const row=document.createElement("div");
  row.className="message "+(kind==="user"?"user-message":"assistant-message");
  const avatar=document.createElement("span");
  avatar.className="message-avatar";
  avatar.setAttribute("aria-hidden","true");
  avatar.textContent=kind==="user"?"أنت":"Z";
  const content=document.createElement("div");
  content.className="message-content";
  const paragraph=document.createElement("p");
  paragraph.textContent=String(text??"");
  content.append(paragraph);
  row.append(avatar,content);
  conversation.append(row);
  conversation.scrollTop=conversation.scrollHeight;
}

async function api(path,{method="GET",body}={}){
  const response=await fetch(runtimeBaseUrl+path,{
    method,
    headers:{
      Authorization:"Bearer "+runtimeToken,
      ...(body?{"Content-Type":"application/json"}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(payload.error||("Gateway returned HTTP "+response.status));
  return payload;
}

connectButton.addEventListener("click",async()=>{
  const rawUrl=runtimeUrlInput.value.trim();
  const token=runtimeTokenInput.value.trim();
  if(!rawUrl||!token){
    appendMessage("أدخل عنوان Task Gateway ورمز الاتصال أولاً.");
    return;
  }
  let parsed;
  try{parsed=new URL(rawUrl);}catch{
    appendMessage("عنوان المحرك غير صالح.");
    return;
  }
  if(!["http:","https:"].includes(parsed.protocol)){
    appendMessage("يجب أن يبدأ عنوان المحرك بـ HTTP أو HTTPS.");
    return;
  }
  if(location.protocol==="https:"&&parsed.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(parsed.hostname)){
    appendMessage("المتصفح يمنع الاتصال غير المشفر من صفحة HTTPS. استخدم HTTPS للمحرك.");
    return;
  }
  runtimeBaseUrl=parsed.origin+parsed.pathname.replace(/\/$/,"");
  runtimeToken=token;
  connectButton.disabled=true;
  connectButton.textContent="جارٍ التحقق...";
  try{
    const healthResponse=await fetch(runtimeBaseUrl+"/api/health",{cache:"no-store"});
    const health=await healthResponse.json();
    if(!healthResponse.ok||health.status!=="ok")throw new Error("Task Gateway غير جاهز.");
    const inventory=await api("/api/models");
    const models=Array.isArray(inventory.models)?inventory.models:[];
    if(!models.length)throw new Error("المحرك متصل، لكن لم يتم العثور على نموذج محلي مثبت في Ollama.");
    runtimeModelSelect.replaceChildren();
    for(const model of models){
      const option=document.createElement("option");
      option.value=model;
      option.textContent=model;
      runtimeModelSelect.append(option);
    }
    runtimeModelSelect.disabled=false;
    runtimeTokenInput.value="";
    setConnectionState(true);
    securityNote.lastChild.textContent=" رمز الاتصال محفوظ في ذاكرة الصفحة فقط، ولا يُكتب في التخزين المحلي.";
    appendMessage("تم الاتصال بالمحرك واكتشاف "+models.length+" نموذج محلي. يمكنك الآن إرسال مهمة للتنفيذ.");
  }catch(error){
    runtimeToken="";
    runtimeBaseUrl="";
    setConnectionState(false);
    appendMessage("تعذر الاتصال: "+error.message);
  }finally{
    connectButton.disabled=false;
    connectButton.textContent="اتصال بالمحرك";
  }
});

form.addEventListener("submit",async event=>{
  event.preventDefault();
  const message=input.value.trim();
  if(!message)return;
  appendMessage(message,"user");
  input.value="";
  if(!connected){
    appendMessage("المحرك غير متصل. افتح إعداد اتصال المحرك واربط Task Gateway ونموذج Ollama محلياً.");
    return;
  }
  sendButton.disabled=true;
  input.disabled=true;
  executionStatus.textContent="جارٍ تنفيذ المهمة...";
  try{
    const task=await api("/api/tasks",{method:"POST",body:{request:message,workspaceId:"black-vanta"}});
    const completed=await api("/api/tasks/"+encodeURIComponent(task.id)+"/agent-run",{
      method:"POST",
      body:{model:runtimeModelSelect.value,confirmExecution:true}
    });
    const result=completed.result??{};
    if(completed.status==="succeeded"&&result.completed===true){
      appendMessage("اكتملت المهمة: "+(result.summary||"تم التحقق من النتيجة")+". عدد خطوات الوكيل: "+(result.steps??0)+".");
    }else{
      const detail=result.message||completed.error||"لم يقدم الوكيل دليلاً كافياً لإعلان الاكتمال.";
      appendMessage("حالة المهمة: "+completed.status+". "+detail+" رقم المهمة: "+completed.id);
    }
    executionStatus.textContent=completed.status==="succeeded"?"آخر مهمة مكتملة":"تحتاج إلى متابعة";
  }catch(error){
    appendMessage("تعذر تنفيذ المهمة: "+error.message);
    executionStatus.textContent="تعذر التنفيذ";
  }finally{
    sendButton.disabled=false;
    input.disabled=false;
    input.focus();
  }
});

if("serviceWorker" in navigator&&location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
