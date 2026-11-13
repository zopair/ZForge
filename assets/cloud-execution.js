(() => {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const conversation = document.getElementById('conversation');
  const status = document.getElementById('runtime-status');
  if (!form || !input || !conversation || !status) return;

  const API_ROOT = 'https://api.github.com/repos/zopair/ZForge';
  const POLL_INTERVAL_MS = 12000;
  const MAX_WAIT_MS = 10 * 60 * 1000;

  function appendMessage(text, kind = 'assistant') {
    const row = document.createElement('div');
    row.className = 'message ' + (kind === 'user' ? 'user-message' : 'assistant-message');
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = kind === 'user' ? 'أنت' : 'Z';
    const content = document.createElement('div');
    content.className = 'message-content';
    const paragraph = document.createElement('p');
    paragraph.textContent = String(text ?? '');
    content.append(paragraph);
    row.append(avatar, content);
    conversation.append(row);
    conversation.scrollTop = conversation.scrollHeight;
  }

  const wait = ms => new Promise(resolve => window.setTimeout(resolve, ms));

  async function githubJson(url) {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = payload.message || ('GitHub returned HTTP ' + response.status);
      throw new Error(reason);
    }
    return payload;
  }

  async function watchCloudReply(correlationId, statusNode) {
    const deadline = Date.now() + MAX_WAIT_MS;
    let issue = null;
    statusNode.textContent = 'بانتظار إرسال الطلب على GitHub...';
    try {
      while (Date.now() < deadline && !issue) {
        const query = encodeURIComponent('repo:zopair/ZForge is:issue in:title ZForgeChat-' + correlationId);
        const search = await githubJson('https://api.github.com/search/issues?q=' + query + '&per_page=1');
        issue = search.items?.find(item => item.pull_request == null) ?? null;
        if (!issue) await wait(POLL_INTERVAL_MS);
      }
      if (!issue) throw new Error('لم يتم العثور على طلب GitHub. تأكد من إرسال النموذج في صفحة GitHub ثم عُد إلى BLACK VANTA.');

      statusNode.textContent = 'وصل الطلب إلى العامل السحابي. جارٍ انتظار رد BLACK VANTA...';
      while (Date.now() < deadline) {
        const comments = await githubJson(API_ROOT + '/issues/' + issue.number + '/comments?per_page=100');
        const marker = '<!-- ZFORGE_CONVERSATION_RESULT_V1:' + correlationId + ' -->';
        const result = [...comments].reverse().find(comment => typeof comment.body === 'string' && comment.body.includes(marker));
        if (result) {
          const reply = result.body.slice(result.body.indexOf(marker) + marker.length).trim();
          if (!reply) throw new Error('وصل رد فارغ من العامل السحابي.');
          appendMessage(reply);
          statusNode.textContent = 'وصل رد ZForge داخل المحادثة';
          return;
        }
        await wait(POLL_INTERVAL_MS);
      }
      throw new Error('انتهت مهلة انتظار العامل السحابي. افتح طلب GitHub لمراجعة حالة التشغيل.');
    } catch (error) {
      appendMessage('تعذر استلام الرد السحابي: ' + error.message + ' يمكنك متابعة الطلب من GitHub.');
      statusNode.textContent = 'تعذر استلام الرد';
    }
  }

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
    paragraph.textContent = 'سيفتح طلب ZForge السحابي في GitHub. أرسل الطلب هناك، ثم ارجع إلى هذه الصفحة؛ ستصل الإجابة هنا تلقائياً بعد انتهاء العامل.';
    const warning = document.createElement('p');
    warning.className = 'muted';
    warning.textContent = 'المستودع عام: لا ترسل كلمات مرور أو مفاتيح API أو بيانات خاصة.';
    const link = document.createElement('a');
    const correlationId = crypto.randomUUID().toLowerCase();
    link.className = 'cloud-task-link';
    const titleText = request.replace(/\s+/g, ' ').slice(0, 56);
    const issueUrl = new URL('https://github.com/zopair/ZForge/issues/new');
    issueUrl.searchParams.set('title', '[ZForge Cloud Task] ' + titleText + ' [ZForgeChat:' + correlationId + ']');
    issueUrl.searchParams.set('body', request);
    link.href = issueUrl.toString();
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'فتح طلب التنفيذ السحابي';
    const progress = document.createElement('p');
    progress.className = 'cloud-task-progress muted';
    progress.setAttribute('role', 'status');
    progress.textContent = 'سيبدأ تتبع الرد بعد فتح الطلب وإرساله على GitHub.';
    link.addEventListener('click', () => {
      if (link.dataset.tracking === 'true') return;
      link.dataset.tracking = 'true';
      watchCloudReply(correlationId, progress);
    });
    content.append(paragraph, warning, link, progress);
    row.append(avatar, content);
    conversation.append(row);
    conversation.scrollTop = conversation.scrollHeight;
  }

  document.addEventListener('submit', event => {
    if (event.target !== form) return;
    const request = input.value.trim();
    if (!request || status.textContent.trim() !== 'المحرك غير متصل') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    appendMessage(request, 'user');
    input.value = '';
    appendCloudHandoff(request);
  }, true);
})();
