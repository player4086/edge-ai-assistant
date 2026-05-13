// --- DOM refs ---
const chatMessages = document.getElementById('chat-messages');
const loadingEl = document.getElementById('loading-indicator');
const userInput = document.getElementById('user-input');
const btnSend = document.getElementById('btn-send');
const charCount = document.getElementById('char-count');
const modeSelect = document.getElementById('mode-select');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const apiBaseInput = document.getElementById('api-base-input');
const modelInput = document.getElementById('model-input');

// --- State ---
let isStreaming = false;
let conversationHistory = [];

// --- Settings ---
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      apiKey: '',
      apiBase: 'https://api.deepseek.com/anthropic',
      model: 'deepseek-v4-pro[1m]'
    }, resolve);
  });
}

function loadSettingsToForm() {
  chrome.storage.local.get({
    apiKey: '',
    apiBase: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-v4-pro[1m]'
  }, (s) => {
    apiKeyInput.value = s.apiKey;
    apiBaseInput.value = s.apiBase;
    modelInput.value = s.model;
  });
}

// --- System Prompts ---
function getSystemPrompt(mode) {
  if (mode === 'explain') {
    return '你是一个资深软件工程师。用中文解释用户提供的代码。说明代码的功能、关键逻辑、输入输出，以及值得注意的细节。如果代码有问题，请指出。';
  }
  if (mode === 'translate') {
    return '你是一个专业翻译。将用户提供的文本翻译成中文。如果是代码注释或文档，保留技术术语的准确性。只输出翻译结果，不要解释。';
  }
  return '你是一个有帮助的AI助手。请用中文回答用户的问题。如果用户提供代码，请解释它。如果用户提供外文，请翻译它。';
}

// --- Simple Markdown → HTML ---
function renderMarkdown(text) {
  // Escape HTML entities first (except what we'll generate)
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Fenced code blocks with language
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<pre>${langLabel}<button class="copy-btn" data-code="${escapeAttr(code.trim())}">复制</button><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // Ordered lists
  html = html.replace(/^(\s*)\d+\. (.+)$/gm, '$1<li>$2</li>');

  // Paragraphs: wrap consecutive non-empty, non-tag lines
  html = html.replace(/^(?!<[hupol])(.+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '<br>');

  return html;
}

function escapeAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Append message to chat ---
function appendMessage(role, content, isPartial = false) {
  // Remove partial message if replacing
  if (isPartial) {
    const existing = chatMessages.querySelector('.msg.streaming');
    if (existing) {
      // Update content
      const contentEl = existing.querySelector('.msg-content');
      contentEl.innerHTML = renderMarkdown(content);
      bindCopyButtons(contentEl);
      chatContainer().scrollTop = chatContainer().scrollHeight;
      return;
    }
  }

  const div = document.createElement('div');
  div.className = `msg ${role}` + (isPartial ? ' streaming' : '');
  div.innerHTML = `<div class="msg-content">${renderMarkdown(content)}</div>`;

  // Remove welcome message
  const welcome = chatMessages.querySelector('.msg.welcome');
  if (welcome) welcome.remove();

  chatMessages.appendChild(div);
  bindCopyButtons(div);
  chatContainer().scrollTop = chatContainer().scrollHeight;
}

function bindCopyButtons(parent) {
  parent.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.dataset.code;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1500);
      });
    });
  });
}

function chatContainer() {
  return document.getElementById('chat-container');
}

// --- Show/hide loading ---
function setLoading(show) {
  loadingEl.style.display = show ? 'block' : 'none';
  if (show) chatContainer().scrollTop = chatContainer().scrollHeight;
}

// --- Call AI API (Streaming) ---
async function callAI(userText, mode) {
  const settings = await getSettings();
  if (!settings.apiKey) {
    appendMessage('assistant', '**请先设置 API Key**\n\n点击右上角"设置"按钮，输入你的 DeepSeek API Key。');
    return;
  }

  setLoading(true);
  isStreaming = true;
  btnSend.disabled = true;

  const systemPrompt = getSystemPrompt(mode);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.slice(-10),
    { role: 'user', content: userText }
  ];

  // Save user message
  appendMessage('user', userText);
  conversationHistory.push({ role: 'user', content: userText });

  const url = settings.apiBase.replace(/\/+$/, '') + '/v1/messages';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 4096,
        stream: true,
        messages
      })
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`API 错误 ${resp.status}: ${errText}`);
    }

    // Parse SSE stream
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          // Anthropic SSE format: { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullContent += parsed.delta.text;
            if (firstChunk) {
              setLoading(false);
              appendMessage('assistant', fullContent, true);
              firstChunk = false;
            } else {
              appendMessage('assistant', fullContent, true);
            }
          }
        } catch (e) {
          // skip unparseable lines
        }
      }
    }

    // Finalize
    const finalEl = chatMessages.querySelector('.msg.streaming');
    if (finalEl) finalEl.classList.remove('streaming');

    if (fullContent) {
      conversationHistory.push({ role: 'assistant', content: fullContent });
      // Keep conversation from growing too large
      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }
    } else if (firstChunk) {
      setLoading(false);
      appendMessage('assistant', '_(AI 未返回内容，请重试)_');
    }
  } catch (err) {
    setLoading(false);
    const finalEl = chatMessages.querySelector('.msg.streaming');
    if (finalEl) finalEl.remove();
    appendMessage('assistant', `**请求失败**\n\n\`\`\`\n${err.message}\n\`\`\``);
  } finally {
    isStreaming = false;
    btnSend.disabled = false;
  }
}

// --- Send current input ---
function sendInput() {
  if (isStreaming) return;
  const text = userInput.value.trim();
  if (!text) return;
  const mode = modeSelect.value;
  userInput.value = '';
  updateCharCount();
  callAI(text, mode);
}

// --- Char count ---
function updateCharCount() {
  const len = userInput.value.length;
  charCount.textContent = `${len} / 8000`;
  charCount.style.color = len > 8000 ? '#f38ba8' : '#6c7086';
}

// --- Event Listeners ---
btnSend.addEventListener('click', sendInput);

userInput.addEventListener('input', updateCharCount);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendInput();
  }
});

// Settings modal
document.getElementById('btn-settings').addEventListener('click', () => {
  loadSettingsToForm();
  settingsModal.style.display = 'flex';
});

document.getElementById('btn-close-settings').addEventListener('click', () => {
  settingsModal.style.display = 'none';
});

document.getElementById('btn-save-settings').addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(),
    apiBase: apiBaseInput.value.trim(),
    model: modelInput.value.trim()
  }, () => {
    settingsModal.style.display = 'none';
  });
});

settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) settingsModal.style.display = 'none';
});

// Clear chat
document.getElementById('btn-clear').addEventListener('click', () => {
  conversationHistory = [];
  chatMessages.innerHTML = `
    <div class="msg welcome">
      <div class="msg-content">
        <p><strong>对话已清空</strong></p>
        <p>选中网页文本或输入新问题开始对话。</p>
      </div>
    </div>
  `;
});

// --- Listen for messages from background/content ---
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'QUERY_AI' && msg.text) {
    // Set mode if provided
    if (msg.mode && (msg.mode === 'explain' || msg.mode === 'translate')) {
      modeSelect.value = msg.mode;
    }
    callAI(msg.text, modeSelect.value);
    return true;
  }
  return false;
});

// --- Init ---
updateCharCount();
