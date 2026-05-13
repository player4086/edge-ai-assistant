// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-explain',
    title: 'AI 解释代码',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ai-translate',
    title: 'AI 翻译',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'ai-summarize',
    title: 'AI 摘要页面',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ai-summarize') {
    summarizePage(tab);
    return;
  }
  const mode = info.menuItemId === 'ai-explain' ? 'explain' : 'translate';
  const text = info.selectionText;
  if (!text) return;
  relayToPanel(tab, text.trim(), mode);
});

// --- Keyboard Shortcuts ---
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'summarize') {
    summarizePage(tab);
    return;
  }
  if (command === 'highlight') {
    chrome.tabs.sendMessage(tab.id, { type: 'HIGHLIGHT_SELECTION' });
    return;
  }
  const modeMap = { explain: 'explain', translate: 'translate' };
  if (modeMap[command]) {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTED_TEXT' }, (resp) => {
      if (resp && resp.text) {
        relayToPanel(tab, resp.text, modeMap[command]);
      }
    });
  }
});

function relayToPanel(tab, text, mode) {
  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'QUERY_AI', text, mode });
    }, 300);
  });
}

// --- Page Summarize ---
function summarizePage(tab) {
  chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' }, (resp) => {
    if (resp && resp.content) {
      const text = resp.content.substring(0, 8000);
      relayToPanel(tab, text, 'summarize');
    } else {
      // Fallback: inject extractor and retry once
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const clone = document.body.cloneNode(true);
          clone.querySelectorAll('script,style,noscript,header,footer,nav,iframe,svg').forEach(e => e.remove());
          return clone.innerText.replace(/\n{3,}/g, '\n\n').trim();
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          const text = results[0].result.substring(0, 8000);
          relayToPanel(tab, text, 'summarize');
        }
      });
    }
  });
}

// --- Relay messages ---
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'QUERY_AI' && sender.tab) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'QUERY_AI',
          text: msg.text,
          mode: msg.mode
        });
      }, 300);
    });
    return true;
  }
  if (msg.type === 'GET_SELECTED_TEXT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTED_TEXT' }, () => {
          if (chrome.runtime.lastError) return;
        });
      }
    });
    return true;
  }
  return false;
});
