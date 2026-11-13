const statusNode=document.getElementById("runtime-status");
const form=document.getElementById("chat-form");
const input=document.getElementById("chat-input");
const sendButton=document.getElementById("send-button");
const conversation=document.getElementById("conversation");
const runtimeUrlInput=document.getElementById("runtime-url");
const runtimeTokenInput=document.getElementById("runtime-token");
const runtimeModelSelect=document.getElementById("runtime-model");
const runtimeAgentSelect=document.getElementById("runtime-agent");
const androidProjectPath=document.getElementById("android-project-path");
const androidBuildButton=document.getElementById("android-build-button");
const webProjectPath=document.getElementById("web-project-path");
const webOutputDirectory=document.getElementById("web-output-directory");
const webBuildButton=document.getElementById("web-build-button");
const connectButton=document.getElementById("connect-runtime");
const runtimeBadge=document.getElementById("runtime-badge");
const chiefStatus=document.getElementById("chief-status");
const executionStatus=document.getElementById("execution-status");
const securityNote=document.getElementById("security-note");

let runtimeBaseUrl="";
let runtimeToken="";
let connected=false;
let latestTaskId=null;

function setConnectionState(value){
  connected=value;
  statusNode.textContent=value?"المحرك متصل":"المحرك غير متصل";
  runtimeBadge.textContent=value?"RUNTIME ONLINE":"RUNTIME OFFLINE";
  chiefStatus.textContent=value?"النموذج المحلي متصل":"بانتظار الاتصال";
  executionStatus.textContent=value?"جاهز لتنفيذ المهام":"بانتظار الاتصال";
  androidBuildButton.disabled=!(value&&latestTaskId);
  webBuildButton.disabled=!(value&&latestTaskId);
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

function appendProgressEvent(event){
  const feed=document.getElementById("agent-progress-feed");
  if(!feed)return;
  const details=event.details??{};
  let message=null;
  if(event.type==="agent.started")message="بدأ الوكيل المحلي التنفيذ.";
  else if(event.type==="agent.step.started")message="الوكيل ينفذ الخطوة "+details.step+" من "+(details.maxSteps??"")+" .";
  else if(event.type==="agent.tool.started")message="بدأ استخدام الأداة: "+String(details.toolName??"unknown")+".";
  else if(event.type==="agent.tool.completed")message="انتهت الأداة "+String(details.toolName??"")+(details.ok===true?" بنجاح.":" مع تعثر.");
  else if(event.type==="agent.completed")message="اكتمل عمل الوكيل بعد التحقق من الأدلة.";
  else if(event.type==="agent.needs_action")message="الوكيل يحتاج إلى توجيه إضافي.";
  else if(event.type==="agent.step_limit")message="وصل الوكيل إلى حد خطوات التنفيذ.";
  else if(event.type==="agent.failed")message="تعثر تنفيذ الوكيل.";
  else if(event.type==="agent.task.started")message="بدأ الوكيل المتخصص: "+String(details.agentId??"");
  else if(event.type==="agent.task.completed")message="اكتمل الوكيل المتخصص: "+String(details.agentId??"");
  else if(event.type==="agent.task.failed")message="تعثر الوكيل المتخصص: "+String(details.agentId??"");
  else if(event.type==="agent.task.skipped")message="تم تجاوز الوكيل التابع لتعثر سابق: "+String(details.agentId??"");
  if(!message)return;
  const row=document.createElement("p");
  row.className="agent-progress-event";
  row.textContent=message;
  feed.append(row);
  while(feed.children.length>24)feed.firstElementChild.remove();
  feed.scrollTop=feed.scrollHeight;
  executionStatus.textContent=message;
}

async function streamTaskEvents(taskId,signal){
  let cursor=0;
  while(!signal.aborted){
    try{
      const payload=await api("/api/tasks/"+encodeURIComponent(taskId)+"/events?after="+cursor);
      for(const event of payload.events??[])appendProgressEvent(event);
      cursor=payload.cursor??cursor;
      if(["succeeded","failed","inconclusive","cancelled"].includes(payload.status))break;
    }catch(error){
      if(!signal.aborted)executionStatus.textContent="توقف بث التقدم: "+error.message;
      break;
    }
    await new Promise(resolve=>window.setTimeout(resolve,800));
  }
}

function appendArtifactLink(artifact){
  const row=document.createElement("div");
  row.className="message assistant-message artifact-message";
  const avatar=document.createElement("span");
  avatar.className="message-avatar";
  avatar.textContent="↓";
  const content=document.createElement("div");
  content.className="message-content";
  const link=document.createElement("a");
  link.className="artifact-link";
  link.href="#";
  link.textContent="تحميل "+artifact.filename+" · "+artifact.sizeBytes+" بايت";
  link.addEventListener("click",async event=>{
    event.preventDefault();
    link.setAttribute("aria-busy","true");
    try{
      const response=await fetch(runtimeBaseUrl+"/api/artifacts/"+encodeURIComponent(artifact.id)+"/download",{
        headers:{Authorization:"Bearer "+runtimeToken}
      });
      if(!response.ok)throw new Error("تعذر تنزيل الملف.");
      const objectUrl=URL.createObjectURL(await response.blob());
      const download=document.createElement("a");
      download.href=objectUrl;
      download.download=artifact.filename;
      document.body.append(download);
      download.click();
      download.remove();
      window.setTimeout(()=>URL.revokeObjectURL(objectUrl),60000);
    }catch(error){
      appendMessage(error.message);
    }finally{
      link.removeAttribute("aria-busy");
    }
  });
  content.append(link);
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
    const agentInventory=await api("/api/agents");
    runtimeAgentSelect.replaceChildren();
    const defaultAgent=document.createElement("option");
    defaultAgent.value="";
    defaultAgent.textContent="Chief Agent — الافتراضي";
    runtimeAgentSelect.append(defaultAgent);
    for(const agent of (agentInventory.agents??[]).filter(item=>item.status==="ACTIVE")){
      const option=document.createElement("option");
      option.value=agent.id;
      option.textContent=agent.name+" · "+agent.version;
      runtimeAgentSelect.append(option);
    }
    runtimeAgentSelect.disabled=false;
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

webBuildButton.addEventListener("click",async()=>{
  if(!connected||!latestTaskId)return;
  webBuildButton.disabled=true;
  const originalLabel=webBuildButton.textContent;
  webBuildButton.textContent="جارٍ اختبار وبناء تطبيق الويب...";
  executionStatus.textContent="جارٍ اختبار وبناء تطبيق الويب...";
  try{
    const completed=await api("/api/tasks/"+encodeURIComponent(latestTaskId)+"/web-build",{
      method:"POST",
      body:{confirmExecution:true,projectPath:webProjectPath.value.trim()||".",outputDirectory:webOutputDirectory.value,runTests:true}
    });
    const result=completed.result??{};
    if(completed.status==="succeeded"&&result.status==="succeeded"){
      appendMessage("اكتمل بناء تطبيق الويب باستخدام "+result.manager+". تم نشر "+(result.artifacts??[]).length+" ملفاً مع بصمات SHA-256.");
      for(const artifact of result.artifacts??[])appendArtifactLink(artifact);
      executionStatus.textContent="بناء الويب مكتمل";
    }else{
      appendMessage("فشل بناء تطبيق الويب: "+(result.error||completed.error||"لم يتم إنشاء مخرجات ثابتة."));
      executionStatus.textContent="بناء الويب فشل";
    }
  }catch(error){
    appendMessage("تعذر بناء تطبيق الويب: "+error.message);
    executionStatus.textContent="تعذر بناء الويب";
  }finally{
    webBuildButton.textContent=originalLabel;
    webBuildButton.disabled=!(connected&&latestTaskId);
  }
});

androidBuildButton.addEventListener("click",async()=>{
  if(!connected||!latestTaskId)return;
  androidBuildButton.disabled=true;
  const originalLabel=androidBuildButton.textContent;
  androidBuildButton.textContent="جارٍ بناء APK وAAB...";
  executionStatus.textContent="جارٍ اختبار وبناء Android...";
  try{
    const projectPath=androidProjectPath.value.trim()||".";
    const completed=await api("/api/tasks/"+encodeURIComponent(latestTaskId)+"/android-build",{
      method:"POST",
      body:{confirmExecution:true,projectPath,formats:["apk","aab"],runTests:true}
    });
    const result=completed.result??{};
    if(completed.status==="succeeded"&&result.status==="succeeded"){
      appendMessage("اكتمل بناء Android. تم نشر "+(result.artifacts??[]).length+" ملفاً مع بصمات SHA-256.");
      for(const artifact of result.artifacts??[])appendArtifactLink(artifact);
      executionStatus.textContent="بناء Android مكتمل";
    }else{
      appendMessage("فشل بناء Android: "+(result.error||completed.error||"لم يتم إنشاء ملفات APK/AAB."));
      executionStatus.textContent="بناء Android فشل";
    }
  }catch(error){
    appendMessage("تعذر بناء Android: "+error.message);
    executionStatus.textContent="تعذر بناء Android";
  }finally{
    androidBuildButton.textContent=originalLabel;
    androidBuildButton.disabled=!(connected&&latestTaskId);
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
    const task=await api("/api/tasks",{method:"POST",body:{request:message}});
    latestTaskId=task.id;
    androidBuildButton.disabled=false;
    webBuildButton.disabled=false;
    const runBody={model:runtimeModelSelect.value,confirmExecution:true};
    if(runtimeAgentSelect.value)runBody.agentId=runtimeAgentSelect.value;
    const progressController=new AbortController();
    const progressStream=streamTaskEvents(task.id,progressController.signal);
    let completed;
    try{
      completed=await api("/api/tasks/"+encodeURIComponent(task.id)+"/agent-run",{
        method:"POST",
        body:runBody
      });
    }finally{
      progressController.abort();
      await progressStream;
    }
    const result=completed.result??{};
    if(completed.status==="succeeded"&&result.completed===true){
      appendMessage("اكتملت المهمة: "+(result.summary||"تم التحقق من النتيجة")+". عدد خطوات الوكيل: "+(result.steps??0)+".");
    }else{
      const detail=result.message||completed.error||"لم يقدم الوكيل دليلاً كافياً لإعلان الاكتمال.";
      appendMessage("حالة المهمة: "+completed.status+". "+detail+" رقم المهمة: "+completed.id);
    }
    for(const item of result.evidence??[]){
      if(item.artifact)appendArtifactLink(item.artifact);
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
