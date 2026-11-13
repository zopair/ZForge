(() => {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const conversation = document.getElementById('conversation');
  const status = document.getElementById('runtime-status');
  if (!form || !input || !conversation || !status) return;

  function appendCloudHandoff(request) {
    const row = document.createElement('div');
    row.className = 'message assistant-message cloud-handoff-message';
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = 'Z';
    const content = document.createElement('div');
    content.className = 'message-content';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'سيتم تشغيل الطلب على عامل ZForge السحابي المؤقت، دون تثبيت أي برنامج على الهاتف. اضغط الرابط لفتح طلب التنفيذ على GitHub، ثم أرسله. ستظهر النتيجة في تعليق على الطلب.';
    const warning = document.createElement('p');
    warning.className = 'muted';
    warning.textContent = 'تنبيه: مستودع GitHub عام؛ لا تضع كلمات مرور أو مفاتيح API أو بيانات خاصة في الطلب.';
    const link = document.createElement('a');
    link.className = 'cloud-task-link';
    const titleText = request.replace(/\\s+/g, ' ').slice(0, 72);
    const issueUrl = new URL('https://github.com/zopair/ZForge/issues/new');
    issueUrl.searchParams.set('title', '[ZForge Cloud Task] ' + titleText);
    issueUrl.searchParams.set('body', request);
    link.href = issueUrl.toString();
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'إرسال إلى عامل التنفيذ السحابي';
    content.append(paragraph, warning, link);
    row.append(avatar, content);
    conversation.append(row);
    conversation.scrollTop = conversation.scrollHeight;
  }

  document.addEventListener('submit', event => {
    if (event.target !== form) return;
    const request = input.value.trim();
    if (!request) return;
    if (status.textContent.trim() !== 'المحرك غير متصل') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (typeof window.appendMessage === 'function') {
      window.appendMessage(request, 'user');
    } else {
      const userRow = document.createElement('div');
      userRow.className = 'message user-message';
      const userContent = document.createElement('div');
      userContent.className = 'message-content';
      const userText = document.createElement('p');
      userText.textContent = request;
      userContent.append(userText);
      userRow.append(userContent);
      conversation.append(userRow);
    }
    input.value = '';
    appendCloudHandoff(request);
  }, true);
})();
