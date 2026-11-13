const statusNode=document.getElementById("runtime-status");
const form=document.getElementById("chat-form");
const input=document.getElementById("chat-input");
const sendButton=document.getElementById("send-button");
const conversation=document.getElementById("conversation");
const runtimeUrlInput=document.getElementById("runtime-url");
const runtimeTokenInput=document.getElementById("runtime-token");
const runtimeModelSelect=document.getElementById("runtime-model");
const androidProjectPath=document.getElementById("android-project-path");
const androidBuildButton=document.getElementById("android-build-button");
const webProjectPath=document.getElementById("web-project-path");
const webOutputDirectory=document.getElementById("web-output-directory");
const webBuildButton=document.getElementById("web-build-button");
const webVerifyButton=document.getElementById("web-verify-button");
const connectButton=document.getElementById("connect-runtime");
const runtimeBadge=document.getElementById("runtime-badge");
const chiefStatus=document.getElementById("chief-status");
const executionStatus=document.getElementById("execution-status");
const securityNote=document.getElementById("security-note");
const voiceEnabledInput=document.getElementById("voice-enabled");
const voiceRecordButton=document.getElementById("voice-record-button");
const voiceStatus=document.getElementById("voice-status");
const voiceDiagnostics=document.getElementById("voice-diagnostics");
const voiceDiagnosticsList=document.getElementById("voice-diagnostics-list");

let runtimeBaseUrl="";
let runtimeToken="";
let connected=false;
let latestTaskId=null;
let conversationId=null;
let webBuildReady=false;
let voiceCapabilities={transcription:false,synthesis:false};
let activeRecorder=null;
let activeRecordingStream=null;
let voiceChunks=[];

function setConnectionState(value){
  connected=value;
  statusNode.textContent=value?"المحرك متصل":"المحرك غير متصل";
  runtimeBadge.textContent=value?"RUNTIME ONLINE":"RUNTIME OFFLINE";
  chiefStatus.textContent=value?"النموذج المحلي متصل":"بانتظار الاتصال";
  executionStatus.textContent=value?"جاهز لتنفيذ المهام":"بانتظار الاتصال";
  androidBuildButton.disabled=!(value&&latestTaskId);
  webBuildButton.disabled=!(value&&latestTaskId);
  webVerifyButton.disabled=!(value&&latestTaskId&&webBuildReady);
  voiceRecordButton.disabled=!(value&&voiceEnabledInput.checked&&voiceCapabilities.transcription);
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
  else if(event.type==="agent.task.started")message="بدأ أحد الوكلاء الداخليين تنفيذ مهمته.";
  else if(event.type==="agent.task.completed")message="اكتملت مهمة أحد الوكلاء الداخليين.";
  else if(event.type==="agent.task.failed")message="تعثر أحد الوكلاء الداخليين؛ يجري تقييم النتيجة.";
  else if(event.type==="agent.task.skipped")message="تم تجاوز خطوة تابعة لتعثر سابق.";
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
  let terminal=false;
  const readEvents=async requestSignal=>{
    const payload=await api("/api/tasks/"+encodeURIComponent(taskId)+"/events?after="+cursor,{signal:requestSignal});
    for(const event of payload.events??[])appendProgressEvent(event);
    cursor=payload.cursor??cursor;
    terminal=["succeeded","failed","inconclusive","cancelled"].includes(payload.status);
  };
  const waitForNextPoll=()=>new Promise(resolve=>{
    const finish=()=>{
      window.clearTimeout(timer);
      signal.removeEventListener("abort",finish);
      resolve();
    };
    const timer=window.setTimeout(finish,800);
    signal.addEventListener("abort",finish,{once:true});
  });
  while(!signal.aborted&&!terminal){
    try{await readEvents(signal);}
    catch(error){
      if(!signal.aborted)executionStatus.textContent="توقف بث التقدم: "+error.message;
      break;
    }
    if(!terminal&&!signal.aborted)await waitForNextPoll();
  }
  // The task POST can finish before the next poll. Drain once after abort so
  // the final specialist events are not lost from the visible activity feed.
  if(signal.aborted&&!terminal){
    try{await readEvents(undefined);}
    catch(error){executionStatus.textContent="تعذر استكمال سجل تقدم المهمة: "+error.message;}
  }
}

function renderVoiceDiagnostics(capabilities){
  if(!voiceDiagnostics||!voiceDiagnosticsList)return;
  const checks=capabilities?.checks??{};
  const rows=[
    ["whisperExecutable","Whisper.cpp executable","required"],
    ["whisperModel","Whisper model","required"],
    ["ffmpegExecutable","FFmpeg","required"],
    ["piperInterpreter","Piper interpreter","piper"],
    ["piperModule","Piper module","piper"],
    ["piperModel","Piper voice model","piper"],
    ["piperConfig","Piper model config","piper"],
    ["kemetoneConfigured","KemeTone configuration","kemetone"],
    ["kemetonePython","KemeTone Python","kemetone"],
    ["kemetoneEspeak","espeak-ng","kemetone"],
    ["kemetoneModel","KemeTone model bundle","kemetone"],
    ["kemetoneModule","KemeTone dependencies","kemetone"]
  ];
  voiceDiagnosticsList.replaceChildren();
  for(const [key,label,group] of rows){
    if(!(key in checks))continue;
    const configured=group==="piper"
      ?Boolean(checks.piperModel||checks.piperConfig||checks.piperReady)
      :group==="kemetone"?Boolean(checks.kemetoneConfigured):true;
    const item=document.createElement("li");
    const ready=checks[key]===true;
    const optional=!configured&&group!=="required";
    item.dataset.state=ready?"ready":optional?"optional":"missing";
    item.textContent=label+": "+(ready?"جاهز":optional?"غير مهيأ (اختياري)":"غير جاهز");
    voiceDiagnosticsList.append(item);
  }
  const issues=Array.isArray(capabilities?.issues)?capabilities.issues:[];
  for(const issue of issues){
    if(typeof issue!=="string"||!issue.trim())continue;
    const item=document.createElement("li");
    item.dataset.state="issue";
    item.textContent="مطلوب: "+issue.slice(0,300);
    voiceDiagnosticsList.append(item);
  }
  if(!voiceDiagnosticsList.children.length){
    const item=document.createElement("li");
    item.textContent="لم يقدم المحرك تفاصيل تشخيص إضافية.";
    voiceDiagnosticsList.append(item);
  }
  voiceDiagnostics.hidden=false;
}

function appendVoicePlayer(blob){
  const audio=document.createElement("audio");
  audio.className="voice-output";
  audio.controls=true;
  audio.preload="none";
  const objectUrl=URL.createObjectURL(blob);
  audio.src=objectUrl;
  audio.addEventListener("ended",()=>URL.revokeObjectURL(objectUrl),{once:true});
  audio.addEventListener("error",()=>URL.revokeObjectURL(objectUrl),{once:true});
  const row=document.createElement("div");
  row.className="voice-output-row";
  const label=document.createElement("span");
  label.textContent="صوت اصطناعي محلي";
  row.append(label,audio);
  conversation.append(row);
  conversation.scrollTop=conversation.scrollHeight;
}

async function synthesizeLocalSpeech(text){
  if(!voiceCapabilities.synthesis||!text)return;
  const response=await fetch(runtimeBaseUrl+"/api/voice/synthesize",{
    method:"POST",
    headers:{Authorization:"Bearer "+runtimeToken,"Content-Type":"application/json"},
    body:JSON.stringify({text:String(text).slice(0,8000),engine:"auto"})
  });
  if(!response.ok){
    const error=await response.json().catch(()=>({}));
    throw new Error(error.error||"تعذر إنشاء الصوت المحلي.");
  }
  appendVoicePlayer(await response.blob());
}

async function stopVoiceRecording(){
  if(activeRecorder&&activeRecorder.state==="recording"){
    voiceRecordButton.disabled=true;
    voiceRecordButton.textContent="جارٍ معالجة التسجيل...";
    activeRecorder.stop();
  }
}

voiceEnabledInput.addEventListener("change",()=>{
  voiceRecordButton.disabled=!(connected&&voiceEnabledInput.checked&&voiceCapabilities.transcription);
  if(!voiceEnabledInput.checked)stopVoiceRecording();
});

voiceRecordButton.addEventListener("click",async()=>{
  if(!connected||!voiceEnabledInput.checked||!voiceCapabilities.transcription)return;
  if(activeRecorder&&activeRecorder.state==="recording"){
    await stopVoiceRecording();
    return;
  }
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
    voiceStatus.textContent="المتصفح لا يدعم التسجيل الصوتي.";
    return;
  }
  try{
    activeRecordingStream=await navigator.mediaDevices.getUserMedia({audio:true});
    voiceChunks=[];
    const preferredType="audio/webm;codecs=opus";
    const options=MediaRecorder.isTypeSupported(preferredType)?{mimeType:preferredType}:{};
    activeRecorder=new MediaRecorder(activeRecordingStream,options);
    activeRecorder.addEventListener("dataavailable",event=>{if(event.data?.size)voiceChunks.push(event.data);});
    activeRecorder.addEventListener("stop",async()=>{
      const recorder=activeRecorder;
      const blob=new Blob(voiceChunks,{type:recorder?.mimeType||"audio/webm"});
      activeRecordingStream?.getTracks().forEach(track=>track.stop());
      activeRecordingStream=null;
      activeRecorder=null;
      voiceChunks=[];
      voiceRecordButton.textContent="بدء التسجيل الصوتي";
      voiceRecordButton.disabled=!(connected&&voiceEnabledInput.checked&&voiceCapabilities.transcription);
      try{
        if(!blob.size)throw new Error("التسجيل الصوتي فارغ.");
        voiceStatus.textContent="جارٍ تحويل الصوت محلياً...";
        const response=await fetch(runtimeBaseUrl+"/api/voice/transcribe",{
          method:"POST",
          headers:{Authorization:"Bearer "+runtimeToken,"Content-Type":blob.type||"audio/webm"},
          body:blob
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(result.error||"تعذر التعرف على الكلام.");
        input.value=result.text||"";
        voiceStatus.textContent="تم التعرف على الكلام محلياً. راجع النص قبل إرساله.";
        appendMessage("تم تحويل التسجيل إلى نص محلياً باستخدام "+(result.engine||"محرك محلي")+". راجع النص في مربع الكتابة.");
      }catch(error){
        voiceStatus.textContent="تعذر تحويل التسجيل.";
        appendMessage("تعذر تحويل الصوت: "+error.message);
      }
    });
    activeRecorder.start();
    voiceRecordButton.textContent="إيقاف التسجيل";
    voiceStatus.textContent="جارٍ التسجيل من الميكروفون...";
  }catch(error){
    activeRecordingStream?.getTracks().forEach(track=>track.stop());
    activeRecordingStream=null;
    voiceStatus.textContent="تعذر الوصول إلى الميكروفون.";
    appendMessage("تعذر بدء التسجيل: "+error.message);
  }
});

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

async function api(path,{method="GET",body,signal}={}){
  const response=await fetch(runtimeBaseUrl+path,{
    method,
    headers:{
      Authorization:"Bearer "+runtimeToken,
      ...(body?{"Content-Type":"application/json"}:{})
    },
    ...(body?{body:JSON.stringify(body)}:{}),
    ...(signal?{signal}:{})
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
    const capabilityInventory=await api("/api/capabilities");
    appendMessage("تم الاتصال بـ ZForge. النواة الحوارية جاهزة، وعدد القدرات المسجلة: "+(capabilityInventory.capabilities??[]).length+". الوكلاء تتم إدارتهم داخلياً.");
    let voiceInventory={capabilities:{}};
    try{
      voiceInventory=await api("/api/voice/capabilities");
      voiceCapabilities=voiceInventory.capabilities??{transcription:false,synthesis:false};
      renderVoiceDiagnostics(voiceCapabilities);
    }catch{
      voiceCapabilities={transcription:false,synthesis:false};
      renderVoiceDiagnostics({issues:["تعذر قراءة تقرير جاهزية الصوت من المحرك المحلي."]});
    }
    voiceEnabledInput.disabled=!(voiceCapabilities.transcription||voiceCapabilities.synthesis);
    voiceRecordButton.disabled=!(voiceCapabilities.transcription&&voiceEnabledInput.checked);
    const voiceEngines=[voiceCapabilities.transcription?"whisper.cpp":null,voiceCapabilities.synthesis?(voiceInventory.capabilities?.engines?.synthesis||"TTS محلي"):null].filter(Boolean);
    const missingVoiceEngines=[
      ...(!voiceCapabilities.transcription?["Whisper.cpp + FFmpeg"]:[]),
      ...(!voiceCapabilities.synthesis?["Piper + نموذج الصوت"]:[])
    ];
    voiceStatus.textContent=voiceEngines.length
      ?"المحركات الجاهزة محلياً: "+voiceEngines.join(" + ")+(missingVoiceEngines.length?" · غير مهيأ: "+missingVoiceEngines.join(" + "):"")
      :"الصوت المحلي غير جاهز. يلزم تهيئة: "+missingVoiceEngines.join(" + ")+". راجع سجل المحرك.";

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
  webBuildReady=false;
  webVerifyButton.disabled=true;
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
      webBuildReady=true;
      webVerifyButton.disabled=!(connected&&latestTaskId);
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

webVerifyButton.addEventListener("click",async()=>{
  if(!connected||!latestTaskId||!webBuildReady)return;
  webVerifyButton.disabled=true;
  const originalLabel=webVerifyButton.textContent;
  webVerifyButton.textContent="جارٍ اختبار المتصفحات...";
  executionStatus.textContent="جارٍ تشغيل التطبيق المبني في المتصفحات...";
  try{
    const completed=await api("/api/tasks/"+encodeURIComponent(latestTaskId)+"/web-verify",{
      method:"POST",
      body:{
        confirmExecution:true,
        projectPath:webProjectPath.value.trim()||".",
        outputDirectory:webOutputDirectory.value,
        browsers:["chromium","firefox","webkit"],
        viewportWidth:390,
        viewportHeight:844
      }
    });
    const result=completed.result??{};
    if(completed.status==="succeeded"&&result.status==="passed"){
      appendMessage("اجتاز التطبيق اختبارات المتصفح: "+result.summary.passed+" من "+result.summary.total+".");
      for(const browser of result.browsers??[]){
        appendMessage(browser.name+": "+browser.status+" · HTTP "+browser.httpStatus+" · "+browser.title);
      }
      executionStatus.textContent="اختبارات المتصفح مكتملة";
    }else if(result.status==="unavailable"){
      appendMessage("اختبار المتصفح غير متاح: "+(result.reason||completed.error||"Playwright غير مثبت على جهاز المحرك."));
      executionStatus.textContent="Playwright غير مهيأ";
    }else{
      appendMessage("لم يجتز التطبيق جميع اختبارات المتصفح: "+(result.summary?.passed??0)+" نجح، "+(result.summary?.failed??0)+" فشل.");
      for(const browser of result.browsers??[]){
        const issues=[...(browser.pageErrors??[]),...(browser.consoleErrors??[]),...(browser.failedRequests??[])];
        appendMessage(browser.name+": "+(browser.error||issues.join(" | ")||"فشل التحقق من الصفحة أو التخطيط."));
      }
      executionStatus.textContent="اختبارات المتصفح بها إخفاقات";
    }
  }catch(error){
    appendMessage("تعذر اختبار التطبيق في المتصفحات: "+error.message);
    executionStatus.textContent="تعذر اختبار المتصفحات";
  }finally{
    webVerifyButton.textContent=originalLabel;
    webVerifyButton.disabled=!(connected&&latestTaskId&&webBuildReady);
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

async function approveAndExecutePlan(planPayload,button){
  if(!connected||!planPayload?.taskId||!planPayload?.approvedPlan||!planPayload?.approvedPlanSha256)return;
  button.disabled=true;
  button.textContent="جارٍ تنفيذ الخطة المعتمدة...";
  latestTaskId=planPayload.taskId;
  webBuildReady=false;
  webVerifyButton.disabled=true;
  const progressController=new AbortController();
  const progressStream=streamTaskEvents(planPayload.taskId,progressController.signal);
  try{
    const completed=await api("/api/tasks/"+encodeURIComponent(planPayload.taskId)+"/agent-run",{
      method:"POST",
      body:{
        model:runtimeModelSelect.value,
        confirmExecution:true,
        approvedPlan:planPayload.approvedPlan,
        approvedPlanSha256:planPayload.approvedPlanSha256
      }
    });
    progressController.abort();
    await progressStream;
    const result=completed.result??{};
    if(completed.status==="succeeded"&&result.completed===true){
      appendMessage("اكتملت المهمة: "+(result.summary||"تم التحقق من النتيجة")+". عدد خطوات التنفيذ: "+(result.steps??0)+".");
    }else{
      appendMessage("حالة المهمة: "+completed.status+". "+(result.message||completed.error||"لم يقدم الوكيل دليلاً كافياً لإعلان الاكتمال.")+" رقم المهمة: "+completed.id);
    }
    for(const item of result.evidence??[])if(item.artifact)appendArtifactLink(item.artifact);
    if(voiceEnabledInput.checked&&voiceCapabilities.synthesis){
      try{await synthesizeLocalSpeech(result.summary||result.message||"اكتملت المهمة.");}
      catch(error){appendMessage("تعذر إنشاء الرد الصوتي المحلي: "+error.message);}
    }
    button.textContent=completed.status==="succeeded"?"اكتمل التنفيذ":"انتهى التنفيذ";
    executionStatus.textContent=completed.status==="succeeded"?"آخر مهمة مكتملة":"تحتاج إلى متابعة";
  }catch(error){
    progressController.abort();
    await progressStream;
    appendMessage("تعذر تنفيذ الخطة: "+error.message);
    button.textContent="تعذر التنفيذ";
  }
}

function appendPlanApproval(planPayload){
  const row=document.createElement("div");
  row.className="message assistant-message plan-approval-message";
  const avatar=document.createElement("span");
  avatar.className="message-avatar";
  avatar.textContent="Z";
  const content=document.createElement("div");
  content.className="message-content";
  const note=document.createElement("p");
  note.textContent="هذه خطة مقترحة وليست تنفيذاً. راجعها أعلاه؛ لن يبدأ أي وكيل العمل قبل موافقتك.";
  const fingerprint=document.createElement("p");
  fingerprint.className="muted plan-fingerprint";
  fingerprint.textContent="بصمة الخطة SHA-256: "+planPayload.approvedPlanSha256;
  const button=document.createElement("button");
  button.type="button";
  button.className="plan-approve-button";
  button.textContent="الموافقة على الخطة وبدء التنفيذ";
  button.addEventListener("click",()=>approveAndExecutePlan(planPayload,button));
  content.append(note,fingerprint,button);
  row.append(avatar,content);
  conversation.append(row);
  conversation.scrollTop=conversation.scrollHeight;
}

form.addEventListener("submit",async event=>{
  event.preventDefault();
  const message=input.value.trim();
  if(!message)return;
  appendMessage(message,"user");
  input.value="";
  if(!connected){
    appendMessage("المحرك غير متصل. اربط Task Gateway أولاً لبدء الحوار مع ZForge.");
    return;
  }
  sendButton.disabled=true;
  input.disabled=true;
  executionStatus.textContent="ZForge يفهم رسالتك...";
  try{
    const body={message,model:runtimeModelSelect.value};
    if(conversationId)body.conversationId=conversationId;
    const result=await api("/api/conversation",{method:"POST",body});
    conversationId=result.conversationId;
    appendMessage(result.reply||"لم يصل رد من ZForge.");
    if(result.mode==="plan"&&result.requiresApproval===true&&result.executionStarted===false&&result.taskId){
      appendPlanApproval(result);
      executionStatus.textContent="الخطة جاهزة وتنتظر موافقتك";
    }else{
      executionStatus.textContent="ZForge جاهز لمواصلة الحوار";
    }
  }catch(error){
    appendMessage("تعذر إكمال الحوار: "+error.message);
    executionStatus.textContent="تعذر معالجة الرسالة";
  }finally{
    sendButton.disabled=false;
    input.disabled=false;
    input.focus();
  }
});

if("serviceWorker" in navigator&&location.protocol.startsWith("http")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
