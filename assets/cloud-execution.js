import { buildCloudIssueUrl } from '../src/core/cloud-issue-handoff.js';

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
    paragraph.textContent = 'تم تجهيز طلبك للتنفيذ السحابي. انسخ نص المهمة أولاً، ثم افتح GitHub والصقه في خانة وصف الطلب وأرسله.';

    const warning = document.createElement('p');
    warning.className = 'muted';
    warning.textContent = 'تنبيه: مستودع GitHub عام؛ لا تضع كلمات مرور أو مفاتيح API أو بيانات خاصة في الطلب.';

    const copyButton = document.createElement('button');
    copyButton.className = 'cloud-task-copy';
    copyButton.type = 'button';
    copyButton.textContent = 'نسخ نص المهمة';

    const copyStatus = document.createElement('p');
    copyStatus.className = 'cloud-copy-status muted';
    copyStatus.setAttribute('role', 'status');
    copyStatus.textContent = 'نص المهمة محفوظ هنا ولن يوضع داخل رابط GitHub.';

    const fallback = document.createElement('textarea');
    fallback.className = 'cloud-task-fallback';
    fallback.readOnly = true;
    fallback.value = request;
    fallback.setAttribute('aria-label', 'نص المهمة للنسخ اليدوي');
    fallback.hidden = true;

    const link = document.createElement('a');
    link.className = 'cloud-task-link';
    link.href = buildCloudIssueUrl();
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'فتح GitHub لإرسال المهمة';

    copyButton.addEventListener('click', async () => {
      copyButton.disabled = true;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(request);
        copyStatus.textContent = 'تم نسخ نص المهمة بالكامل. افتح GitHub والصقه في خانة وصف الطلب.';
        fallback.hidden = true;
      } catch {
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
        copyStatus.textContent = 'تعذر النسخ التلقائي. حدد النص الظاهر بالأسفل وانسخه يدوياً، ثم افتح GitHub.';
      } finally {
        copyButton.disabled = false;
      }
    });

    content.append(paragraph, warning, copyButton, copyStatus, fallback, link);
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
