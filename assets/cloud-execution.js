(() => {
  const form = document.getElementById('chat-form');
  const input = document.getElementById('chat-input');
  const conversation = document.getElementById('conversation');
  const status = document.getElementById('runtime-status');
  const tokenInput = document.getElementById('github-token');
  const connectButton = document.getElementById('github-connect');
  const disconnectButton = document.getElementById('github-disconnect');
  const authStatus = document.getElementById('github-auth-status');
  const settings = document.getElementById('github-settings');
  const sendButton = document.getElementById('send-button');
  if (!form || !input || !conversation || !status || !tokenInput || !connectButton || !disconnectButton || !authStatus) return;

  const API_ROOT = 'https://api.github.com/repos/zopair/ZForge';
  const EXPECTED_OWNER = 'zopair';
  const POLL_INTERVAL_MS = 15000;
  const MAX_WAIT_MS = 49 * 60 * 1000;
  let githubToken = '';
  let sending = false;

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

  function appendProgress() {
    const row = document.createElement('div');
    row.className = 'message assistant-message cloud-handoff-message';
    const avatar = document.createElement('span');
    avatar.className = 'message-avatar';
    avatar.textContent = 'Z';
    const content = document.createElement('div');
    content.className = 'message-content';
    const paragraph = document.createElement('p');
    paragraph.textContent = 'تم إرسال رسالتك إلى ZForge. يجري العامل السحابي معالجتها؛ سيظهر الرد هنا تلقائياً.';
    const progress = document.createElement('p');
    progress.className = 'cloud-task-progress muted';
    progress.setAttribute('role', 'status');
    progress.textContent = 'جارٍ إنشاء الطلب السحابي...';
    content.append(paragraph, progress);
    row.append(avatar, content);
    conversation.append(row);
    conversation.scrollTop = conversation.scrollHeight;
    return progress;
  }

  async function githubJson(path, { method = 'GET', body } = {}) {
    if (!githubToken) throw new Error('يلزم ربط GitHub قبل إرسال الرسائل.');
    const response = await fetch(API_ROOT + path, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + githubToken,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.message || ('GitHub returned HTTP ' + response.status);
      throw new Error(detail);
    }
    return payload;
  }

  async function validateGithubToken(token) {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    const user = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(user.message || 'تعذر التحقق من رمز GitHub.');
    if (user.login !== EXPECTED_OWNER) {
      throw new Error('يجب ربط حساب مالك المستودع @' + EXPECTED_OWNER + ' حتى يتمكن العامل من استقبال الطلب.');
    }
    const repositoryResponse = await fetch(API_ROOT, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    });
    const repository = await repositoryResponse.json().catch(() => ({}));
    if (!repositoryResponse.ok) throw new Error(repository.message || 'تعذر الوصول إلى مستودع ZForge.');
    if (repository.permissions && !repository.permissions.push && !repository.permissions.admin) {
      throw new Error('الحساب لا يملك صلاحية الكتابة في مستودع ZForge.');
    }
    return user.login;
  }

  connectButton.addEventListener('click', async () => {
    const candidate = tokenInput.value.trim();
    if (!candidate) {
      authStatus.textContent = 'أدخل Fine-grained Personal Access Token أولاً.';
      return;
    }
    connectButton.disabled = true;
    authStatus.textContent = 'جارٍ التحقق من صلاحيات حساب GitHub...';
    try {
      const login = await validateGithubToken(candidate);
      githubToken = candidate;
      tokenInput.value = '';
      tokenInput.disabled = true;
      disconnectButton.disabled = false;
      authStatus.textContent = 'تم ربط @' + login + ' لهذه الجلسة فقط. الرمز محفوظ في ذاكرة الصفحة ولن يُخزّن.';
      settings?.classList.add('github-connected');
    } catch (error) {
      githubToken = '';
      authStatus.textContent = 'تعذر الربط: ' + error.message;
    } finally {
      connectButton.disabled = false;
    }
  });

  disconnectButton.addEventListener('click', () => {
    githubToken = '';
    tokenInput.value = '';
    tokenInput.disabled = false;
    disconnectButton.disabled = true;
    authStatus.textContent = 'تم فصل GitHub ومسح الرمز من ذاكرة الصفحة.';
    settings?.classList.remove('github-connected');
  });

  function createCorrelationId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID().toLowerCase();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  async function watchCloudReply(issueNumber, correlationId, progress) {
    const deadline = Date.now() + MAX_WAIT_MS;
    const marker = '<!-- ZFORGE_CONVERSATION_RESULT_V1:' + correlationId + ' -->';
    progress.textContent = 'وصل الطلب إلى العامل السحابي. جارٍ انتظار رد BLACK VANTA...';
    while (Date.now() < deadline) {
      const comments = await githubJson('/issues/' + issueNumber + '/comments?per_page=100');
      const result = [...comments].reverse().find(comment =>
        typeof comment.body === 'string' && comment.body.includes(marker),
      );
      if (result) {
        const reply = result.body.slice(result.body.indexOf(marker) + marker.length).trim();
        if (!reply) throw new Error('وصل رد فارغ من العامل السحابي.');
        appendMessage(reply);
        progress.textContent = 'وصل رد ZForge داخل المحادثة.';
        return;
      }
      await new Promise(resolve => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error('انتهت مهلة انتظار العامل السحابي. يمكنك إعادة المحاولة؛ لن يُعاد إرسال الطلب تلقائياً.');
  }

  document.addEventListener('submit', async event => {
    if (event.target !== form) return;
    const request = input.value.trim();
    if (!request) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (sending) return;
    appendMessage(request, 'user');
    input.value = '';
    if (!githubToken) {
      appendMessage('اربط حساب GitHub مرة واحدة من إعدادات ربط GitHub، ثم أعد إرسال رسالتك. لا يحتاج ذلك إلى Runtime أو Node.js على الهاتف.');
      if (settings) settings.open = true;
      authStatus.textContent = 'لم يتم ربط GitHub بعد.';
      return;
    }

    sending = true;
    sendButton.disabled = true;
    input.disabled = true;
    const progress = appendProgress();
    try {
      const correlationId = createCorrelationId();
      const title = '[ZForge Cloud Task] ' + request.replace(/\s+/g, ' ').slice(0, 56) + ' [ZForgeChat:' + correlationId + ']';
      const issue = await githubJson('/issues', {
        method: 'POST',
        body: {
          title,
          body: request + '\n\n<!-- Created automatically by BLACK VANTA cloud chat. -->',
        },
      });
      progress.textContent = 'تم إنشاء الطلب السحابي #' + issue.number + '. العامل بدأ المعالجة؛ لا حاجة لفتح GitHub يدوياً.';
      await watchCloudReply(issue.number, correlationId, progress);
    } catch (error) {
      progress.textContent = 'تعذر إكمال الطلب السحابي: ' + error.message;
      appendMessage('تعذر استلام رد ZForge: ' + error.message);
    } finally {
      sending = false;
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  }, true);
})();
