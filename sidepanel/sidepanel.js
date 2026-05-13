// === DOM refs ===
const chatMessages = document.getElementById('chat-messages');
const loadingEl = document.getElementById('loading-indicator');
const userInput = document.getElementById('user-input');
const btnSend = document.getElementById('btn-send');
const charCount = document.getElementById('char-count');
const modeSelect = document.getElementById('mode-select');
const langSelect = document.getElementById('lang-select');
const templateBar = document.getElementById('template-bar');
const settingsModal = document.getElementById('settings-modal');
const apiKeyInput = document.getElementById('api-key-input');
const apiBaseInput = document.getElementById('api-base-input');
const modelInput = document.getElementById('model-input');
const templatesList = document.getElementById('templates-list');
const fileUpload = document.getElementById('file-upload');
const imageUpload = document.getElementById('image-upload');
const uploadPreview = document.getElementById('upload-preview');
const previewContent = document.getElementById('preview-content');
const btnClearUpload = document.getElementById('btn-clear-upload');

// === State ===
let isStreaming = false;
let conversationHistory = [];
let pendingAttachment = null;
let currentTTS = null;

// ============================================
// Help Panel
// ============================================
document.getElementById('btn-help').addEventListener('click', () => {
  const panel = document.getElementById('help-panel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  document.getElementById('btn-help').textContent = isOpen ? '?' : '×';
});

// ============================================
// Theme
// ============================================
function applyTheme(theme) {
  document.body.className = theme;
}
chrome.storage.local.get({ theme: 'dark' }, (s) => applyTheme(s.theme));
document.getElementById('btn-theme').addEventListener('click', () => {
  const next = document.body.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(next);
  chrome.storage.local.set({ theme: next });
});

// ============================================
// Settings
// ============================================
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get({
      apiKey: '', apiBase: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-pro[1m]'
    }, resolve);
  });
}
function loadSettingsToForm() {
  chrome.storage.local.get({
    apiKey: '', apiBase: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-pro[1m]'
  }, (s) => {
    apiKeyInput.value = s.apiKey;
    apiBaseInput.value = s.apiBase;
    modelInput.value = s.model;
    loadTemplates();
  });
}

// ============================================
// Custom Select (shared logic)
// ============================================
function initSelect(el, onChange) {
  const trigger = el.querySelector('.custom-select-trigger');
  const label = el.querySelector('.custom-select-label');
  const options = el.querySelectorAll('.custom-option');

  trigger.addEventListener('click', () => el.classList.toggle('open'));
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      label.textContent = opt.textContent;
      el.classList.remove('open');
      if (onChange) onChange(opt.dataset.value);
    });
  });
}
document.addEventListener('click', (e) => {
  [modeSelect, langSelect].forEach(el => {
    if (el && !el.contains(e.target)) el.classList.remove('open');
  });
});

function getMode() {
  return modeSelect.querySelector('.custom-option.selected').dataset.value;
}
function setMode(value) {
  modeSelect.querySelectorAll('.custom-option').forEach(o => o.classList.toggle('selected', o.dataset.value === value));
  modeSelect.querySelector('.custom-select-label').textContent =
    modeSelect.querySelector(`.custom-option[data-value="${value}"]`).textContent;
}

function getLang() {
  return langSelect.querySelector('.custom-option.selected').dataset.value;
}

// Mode change: show/hide language selector
initSelect(modeSelect, (value) => {
  langSelect.style.display = (value === 'translate') ? 'block' : 'none';
});
initSelect(langSelect, () => {});

// ============================================
// Templates (quick bar)
// ============================================
templateBar.addEventListener('click', (e) => {
  if (e.target.classList.contains('template-btn')) {
    const prompt = e.target.dataset.prompt;
    userInput.value = prompt + '\n' + userInput.value;
    userInput.focus();
    updateCharCount();
  }
});

// Custom templates in settings
function loadTemplates() {
  chrome.storage.local.get({ templates: [] }, (s) => {
    const temps = s.templates;
    templatesList.innerHTML = temps.map((t, i) =>
      `<div class="template-item">
        <span class="temp-name">${escHtml(t.name)}</span>
        <span class="temp-prompt">${escHtml(t.prompt)}</span>
        <span class="temp-del" data-idx="${i}">&times;</span>
      </div>`
    ).join('');
    // Delete handlers
    templatesList.querySelectorAll('.temp-del').forEach(btn => {
      btn.addEventListener('click', () => {
        temps.splice(parseInt(btn.dataset.idx), 1);
        chrome.storage.local.set({ templates: temps }, loadTemplates);
      });
    });
    // Rebuild quick bar
    rebuildTemplateBar(temps);
  });
}

function rebuildTemplateBar(customTemplates) {
  // Remove old custom buttons
  templateBar.querySelectorAll('.template-btn.custom').forEach(b => b.remove());
  customTemplates.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'template-btn custom';
    btn.dataset.prompt = t.prompt;
    btn.textContent = t.name;
    templateBar.appendChild(btn);
  });
}

document.getElementById('btn-add-template').addEventListener('click', () => {
  const nameEl = document.getElementById('template-name-input');
  const promptEl = document.getElementById('template-prompt-input');
  const name = nameEl.value.trim();
  const prompt = promptEl.value.trim();
  if (!name || !prompt) return;
  chrome.storage.local.get({ templates: [] }, (s) => {
    const temps = s.templates;
    temps.push({ name, prompt });
    chrome.storage.local.set({ templates: temps }, () => {
      nameEl.value = '';
      promptEl.value = '';
      loadTemplates();
    });
  });
});

// ============================================
// System Prompts
// ============================================
function getSystemPrompt(mode) {
  if (mode === 'explain') {
    return '你是资深软件工程师。用中文解释用户提供的代码：功能、关键逻辑、输入输出及注意事项。有问题请指出。';
  }
  if (mode === 'translate') {
    const target = getLang();
    return `你是专业翻译。将用户文本翻译成${target}。代码注释和文档保留技术术语准确性。只输出翻译结果。`;
  }
  if (mode === 'summarize') {
    return '你是专业内容摘要助手。将用户提供的网页内容精炼为3-5个要点，每个要点一两句话。突出关键信息和结论。用中文输出。';
  }
  return '你是AI助手，用中文回答。如果用户提供代码就解释它，如果是外文就翻译它，如果是网页内容就摘要它。';
}

// ============================================
// Markdown → HTML
// ============================================
function renderMarkdown(text) {
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : '';
    return `<pre>${langLabel}<button class="copy-btn" data-code="${escapeAttr(code.trim())}">复制</button><code>${code.trim()}</code></pre>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^(\s*)[-*] (.+)$/gm, '$1<li>$2</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  html = html.replace(/^(?!<[hupol])(.+)$/gm, '<p>$1</p>');
  html = html.replace(/<p>\s*<\/p>/g, '<br>');
  return html;
}
function escapeAttr(text) {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============================================
// Append Message
// ============================================
function appendMessage(role, content, isPartial) {
  if (isPartial) {
    const existing = chatMessages.querySelector('.msg.streaming');
    if (existing) {
      existing.querySelector('.msg-content').innerHTML = renderMarkdown(content);
      chatContainer().scrollTop = chatContainer().scrollHeight;
      return;
    }
  }
  const div = document.createElement('div');
  div.className = `msg ${role}` + (isPartial ? ' streaming' : '');
  div.innerHTML = `<div class="msg-content">${renderMarkdown(content)}</div>`;
  if (role === 'assistant' && !isPartial) {
    const btn = document.createElement('button');
    btn.className = 'tts-btn';
    btn.title = '朗读';
    btn.textContent = '🔊';
    btn.addEventListener('click', () => toggleTTS(btn, content));
    div.querySelector('.msg-content').appendChild(btn);
  }
  const welcome = chatMessages.querySelector('.msg.welcome');
  if (welcome) welcome.remove();
  chatMessages.appendChild(div);
  chatContainer().scrollTop = chatContainer().scrollHeight;
}

function chatContainer() { return document.getElementById('chat-container'); }

// ============================================
// TTS (Web Speech API)
// ============================================
function toggleTTS(btn, text) {
  if (currentTTS) {
    window.speechSynthesis.cancel();
    if (currentTTS.btn === btn) { currentTTS = null; btn.classList.remove('playing'); return; }
  }
  const plain = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`>\-\[\]()]/g, '').trim();
  if (!plain) return;
  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  utterance.onend = () => { currentTTS = null; btn.classList.remove('playing'); };
  utterance.onerror = () => { currentTTS = null; btn.classList.remove('playing'); };
  currentTTS = { btn, utterance };
  btn.classList.add('playing');
  window.speechSynthesis.speak(utterance);
}

// ============================================
// Export Conversation
// ============================================
document.getElementById('btn-export').addEventListener('click', () => {
  let md = '# AI 网页助手 - 对话记录\n\n';
  md += `> 导出时间: ${new Date().toLocaleString()}\n\n---\n\n`;
  conversationHistory.forEach(m => {
    const role = m.role === 'user' ? '**你**' : '**AI**';
    let content = typeof m.content === 'string' ? m.content : '[图片/复合内容]';
    md += `### ${role}\n\n${content}\n\n---\n\n`;
  });
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-chat-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================
// Custom Background
// ============================================
const bgImageUpload = document.getElementById('bg-image-upload');
const bgPreview = document.getElementById('bg-preview');

function applyBackground(bgData) {
  if (bgData) {
    document.body.style.setProperty('--bg-image', `url(${bgData})`);
    document.body.classList.add('has-bg');
  } else {
    document.body.style.removeProperty('--bg-image');
    document.body.classList.remove('has-bg');
  }
}

// Load saved background on startup
chrome.storage.local.get({ bgImage: '' }, (s) => {
  if (s.bgImage) {
    applyBackground(s.bgImage);
    updateBgPreview(s.bgImage);
  }
});

function updateBgPreview(bgData) {
  if (bgData) {
    bgPreview.style.backgroundImage = `url(${bgData})`;
    bgPreview.classList.add('has-bg');
  } else {
    bgPreview.style.backgroundImage = '';
    bgPreview.classList.remove('has-bg');
  }
}

document.getElementById('btn-set-bg').addEventListener('click', () => bgImageUpload.click());

bgImageUpload.addEventListener('change', () => {
  const file = bgImageUpload.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert('背景图片不能超过 5 MB');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const data = reader.result;
    chrome.storage.local.set({ bgImage: data }, () => {
      applyBackground(data);
      updateBgPreview(data);
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById('btn-reset-bg').addEventListener('click', () => {
  chrome.storage.local.remove('bgImage', () => {
    applyBackground(null);
    updateBgPreview(null);
    bgImageUpload.value = '';
  });
});

// ============================================
// Upload Handling
// ============================================
document.getElementById('btn-upload-file').addEventListener('click', () => fileUpload.click());
document.getElementById('btn-upload-image').addEventListener('click', () => imageUpload.click());

fileUpload.addEventListener('change', () => {
  const file = fileUpload.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    pendingAttachment = { type: 'file', name: file.name, data: reader.result };
    previewContent.innerHTML = `<strong>文件:</strong> ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    uploadPreview.style.display = 'flex';
  };
  reader.onerror = () => appendMessage('assistant', '**读取文件失败，请重试。**');
  reader.readAsText(file);
});

imageUpload.addEventListener('change', () => {
  const file = imageUpload.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { appendMessage('assistant', '**图片不能超过 10 MB。**'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    pendingAttachment = { type: 'image', name: file.name, data: reader.result, mimeType: file.type };
    previewContent.innerHTML = `<img src="${reader.result}" alt="preview"> <span>${file.name}</span>`;
    uploadPreview.style.display = 'flex';
  };
  reader.onerror = () => appendMessage('assistant', '**读取图片失败，请重试。**');
  reader.readAsDataURL(file);
});

function clearAttachment() {
  pendingAttachment = null; uploadPreview.style.display = 'none';
  previewContent.innerHTML = ''; fileUpload.value = ''; imageUpload.value = '';
}
btnClearUpload.addEventListener('click', clearAttachment);

// ============================================
// Loading
// ============================================
function setLoading(show) {
  loadingEl.style.display = show ? 'block' : 'none';
  if (show) chatContainer().scrollTop = chatContainer().scrollHeight;
}

// ============================================
// API Call
// ============================================
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
  let userContent, displayText;
  const attachment = pendingAttachment;

  if (attachment && attachment.type === 'image') {
    const base64Data = attachment.data.split(',')[1] || attachment.data;
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: attachment.mimeType, data: base64Data } },
      { type: 'text', text: userText || '请描述这张图片' }
    ];
    displayText = userText ? `[图片: ${attachment.name}] ${userText}` : `[图片: ${attachment.name}]`;
  } else if (attachment && attachment.type === 'file') {
    const ext = attachment.name.split('.').pop() || '';
    userContent = userText + `\n\`\`\`${ext}\n${attachment.data}\n\`\`\`\n`;
    displayText = userText + `\n[文件: ${attachment.name}]`;
  } else {
    userContent = userText;
    displayText = userText;
  }

  clearAttachment();

  const messages = [...conversationHistory.slice(-10), { role: 'user', content: userContent }];
  appendMessage('user', displayText);
  conversationHistory.push({ role: 'user', content: userContent });

  const url = settings.apiBase.replace(/\/+$/, '') + '/v1/messages';

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: settings.model, max_tokens: 4096, stream: true, system: systemPrompt, messages })
    });

    if (!resp.ok) throw new Error(`API 错误 ${resp.status}: ${await resp.text()}`);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', fullContent = '', firstChunk = true;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim() || !line.trim().startsWith('data: ')) continue;
        const data = line.trim().slice(6);
        if (data === '[DONE]') continue;
        try {
          const p = JSON.parse(data);
          if (p.type === 'content_block_delta' && p.delta?.text) {
            fullContent += p.delta.text;
            if (firstChunk) { setLoading(false); appendMessage('assistant', fullContent, true); firstChunk = false; }
            else { appendMessage('assistant', fullContent, true); }
          }
        } catch(e) {}
      }
    }

    const finalEl = chatMessages.querySelector('.msg.streaming');
    if (finalEl) finalEl.classList.remove('streaming');

    if (fullContent) {
      conversationHistory.push({ role: 'assistant', content: fullContent });
      if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    } else if (firstChunk) {
      setLoading(false);
      appendMessage('assistant', '_(AI 未返回内容，请重试)_');
    }
  } catch (err) {
    setLoading(false);
    const fe = chatMessages.querySelector('.msg.streaming');
    if (fe) fe.remove();
    appendMessage('assistant', `**请求失败**\n\n\`\`\`\n${err.message}\n\`\`\``);
  } finally {
    isStreaming = false;
    btnSend.disabled = false;
  }
}

// ============================================
// Send logic
// ============================================
function sendInput() {
  if (isStreaming) return;
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = '';
  updateCharCount();
  callAI(text, getMode());
}

function updateCharCount() {
  const len = userInput.value.length;
  charCount.textContent = `${len} / 8000`;
  charCount.style.color = len > 8000 ? '#f38ba8' : '';
}

// ============================================
// Event Listeners
// ============================================
btnSend.addEventListener('click', sendInput);
userInput.addEventListener('input', updateCharCount);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendInput(); }
});

// Settings
document.getElementById('btn-settings').addEventListener('click', () => { loadSettingsToForm(); settingsModal.style.display = 'flex'; });
document.getElementById('btn-close-settings').addEventListener('click', () => { settingsModal.style.display = 'none'; });
document.getElementById('btn-save-settings').addEventListener('click', () => {
  chrome.storage.local.set({
    apiKey: apiKeyInput.value.trim(), apiBase: apiBaseInput.value.trim(), model: modelInput.value.trim()
  }, () => { settingsModal.style.display = 'none'; });
});
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
  conversationHistory = [];
  chatMessages.innerHTML = `<div class="msg welcome"><div class="msg-content"><p><strong>对话已清空</strong></p><p>选中网页文本或输入新问题开始对话。</p></div></div>`;
});

// Messages from background/content
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'QUERY_AI' && msg.text) {
    if (msg.mode && ['explain','translate','summarize'].includes(msg.mode)) setMode(msg.mode);
    if (msg.mode === 'translate') langSelect.style.display = 'block';
    callAI(msg.text, getMode());
    return true;
  }
  return false;
});

// ============================================
// Init
// ============================================
updateCharCount();
loadTemplates();
