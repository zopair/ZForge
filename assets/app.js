const statusNode=document.getElementById("runtime-status");
const form=document.getElementById("chat-form");
const input=document.getElementById("chat-input");
const conversation=document.getElementById("conversation");

function appendMessage(text,kind){
  const row=document.createElement("div");
  row.className="message "+(kind==="user"?"user-message":"assistant-message");
  const avatar=document.createElement("span");
  avatar.className="message-avatar";
  avatar.setAttribute("aria-hidden","true");
  avatar.textContent=kind==="user"?"أنت":"Z";
  const content=document.createElement("div");
  content.className="message-content";
  const paragraph=document.createElement("p");
  paragraph.textContent=text;
  content.append(paragraph);
  row.append(avatar,content);
  conversation.append(row);
  conversation.scrollTop=conversation.scrollHeight;
}

form.addEventListener("submit",event=>{
  event.preventDefault();
  const message=input.value.trim();
  if(!message)return;
  appendMessage(message,"user");
  input.value="";
  appendMessage("تم استلام رسالتك داخل واجهة العرض المحلية. لم يتم تشغيل وكيل ذكاء اصطناعي أو تنفيذ أوامر؛ يلزم توصيل Task Gateway ومحرك النموذج المحلي أولاً.","assistant");
});

if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").catch(()=>{});
  });
}
