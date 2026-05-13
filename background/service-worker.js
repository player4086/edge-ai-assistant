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
  chrome.contextMenus.create({
    id: 'ai-readpage',
    title: 'AI 读取页面内容',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ai-summarize' || info.menuItemId === 'ai-readpage') {
    const mode = info.menuItemId === 'ai-summarize' ? 'summarize' : 'readpage';
    readPageContent(tab, mode);
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
  const modeMap = { explain: 'explain', translate: 'translate' };
  if (modeMap[command]) {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTED_TEXT' }, (resp) => {
      if (chrome.runtime.lastError) return;
      if (resp && resp.text) {
        relayToPanel(tab, resp.text, modeMap[command]);
      }
    });
  }
});

function relayToPanel(tab, text, mode, retries) {
  retries = retries || 0;
  chrome.sidePanel.open({ tabId: tab.id }).then(() => {
    const send = () => {
      chrome.runtime.sendMessage({ type: 'QUERY_AI', text, mode }, (resp) => {
        if (chrome.runtime.lastError && retries < 3) {
          setTimeout(() => relayToPanel(tab, text, mode, retries + 1), 200);
        }
      });
    };
    setTimeout(send, 150);
  });
}

// --- Read Page Content ---
function readPageContent(tab, mode) {
  mode = mode || 'summarize';
  const maxLen = mode === 'readpage' ? 16000 : 8000;
  chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' }, (resp) => {
    if (resp && resp.content) {
      relayToPanel(tab, resp.content.substring(0, maxLen), mode);
    } else {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const root = document.querySelector('article, main, [role="main"], .content, .post, .article') || document.body;
          const skip = new Set(['SCRIPT','STYLE','NOSCRIPT','IFRAME','SVG','IMG','VIDEO','AUDIO','BUTTON','INPUT','SELECT','HEADER','FOOTER','NAV']);
          const parts = [];
          const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
              const p = n.parentElement;
              if (!p || skip.has(p.tagName) || p.closest('script,style,noscript,header,footer,nav,iframe,svg,pre,code')) return NodeFilter.FILTER_REJECT;
              const t = n.textContent.trim();
              return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          });
          while (w.nextNode()) parts.push(w.currentNode.textContent.trim());
          return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
        }
      }, (results) => {
        if (results && results[0] && results[0].result) {
          relayToPanel(tab, results[0].result.substring(0, maxLen), mode);
        }
      });
    }
  });
}

// Backward-compat
function summarizePage(tab) { readPageContent(tab, 'summarize'); }

// --- Relay messages ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTED_TEXT' }, (resp) => {
          if (chrome.runtime.lastError) return;
          sendResponse(resp || { text: '' });
        });
      }
    });
    return true;
  }
  return false;
});
