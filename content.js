// ============================================================
// GitGrind — content.js
// Runs on: https://leetcode.com/problems/*
// Handles: Solution detection, code extraction, floating button
// ============================================================

console.log('[GitGrind] Content script loaded on:', window.location.href);

// ─────────────────────────────────────────
// PLATFORMS REGISTRY
// ─────────────────────────────────────────
const PLATFORMS = {
  leetcode: {
    matches: (url) => url.includes('leetcode.com/problems/'),
    checkForAccepted: (node) => {
      const selectors = ['[data-e2e-locator="submission-result"]', '.text-green-s', '[class*="accepted"]', '[class*="Accepted"]', '.result__1l9i', '[class*="success"]'];
      for (const sel of selectors) {
        const el = node.matches?.(sel) ? node : node.querySelector?.(sel);
        if (el && el.textContent.trim() === 'Accepted') return true;
      }
      if (node.textContent?.trim() === 'Accepted' && (node.className?.includes('green') || node.className?.includes('success') || node.className?.includes('accept'))) return true;
      return false;
    },
    verifyAccepted: () => {
      const el = document.querySelector('[data-e2e-locator="submission-result"]') || document.querySelector('.text-green-s') || document.querySelector('.result__1l9i') || document.querySelector('.text-success');
      return el && el.textContent.trim() === 'Accepted';
    }
  },
  geeksforgeeks: {
    matches: (url) => url.includes('geeksforgeeks.org/problems/'),
    checkForAccepted: (node) => {
      const text = node.textContent?.trim() || '';
      return text.includes('Problem Solved Successfully') || text.includes('Correct Answer');
    },
    verifyAccepted: () => {
      return document.body.textContent.includes('Problem Solved Successfully') || document.body.textContent.includes('Correct Answer');
    },
    extractSolutionData: () => {
      const slug = window.location.pathname.split('/').filter(Boolean).pop() || 'gfg-problem';
      const titleEl = document.querySelector('h3');
      const title = titleEl ? titleEl.textContent.trim() : slug;
      let code = '';
      try {
        const lines = document.querySelectorAll('.ace_line, .view-line');
        if (lines.length) code = Array.from(lines).map(line => line.textContent).join('\n');
      } catch (e) {}
      
      const statementEl = document.querySelector('[class*="problems_problem_content"]');
      const problemStatement = statementEl ? statementEl.innerHTML : '';
      
      return { slug, code, title, number: 'GFG', difficulty: 'Medium', topics: [], language: 'cpp', runtime: '', memory: '', problemStatement, problemUrl: window.location.href.split('?')[0] };
    }
  },
  hackerrank: {
    matches: (url) => url.includes('hackerrank.com/challenges/'),
    checkForAccepted: (node) => {
      const text = node.textContent?.trim() || '';
      return text.includes('Congratulations!') && text.includes('You solved this challenge');
    },
    verifyAccepted: () => {
      return document.querySelector('.congrats-heading') !== null;
    },
    extractSolutionData: () => {
      const slug = window.location.pathname.split('/').filter(Boolean)[1] || 'hackerrank-problem';
      const titleEl = document.querySelector('.page-label');
      const title = titleEl ? titleEl.textContent.trim() : slug;
      
      let code = '';
      try {
        const lines = document.querySelectorAll('.CodeMirror-line');
        if (lines.length) code = Array.from(lines).map(line => line.textContent).join('\n');
      } catch (e) {}
      
      const statementEl = document.querySelector('.challenge-body-html');
      const problemStatement = statementEl ? statementEl.innerHTML : '';
      
      return { slug, code, title, number: 'HR', difficulty: 'Medium', topics: [], language: 'python', runtime: '', memory: '', problemStatement, problemUrl: window.location.href.split('?')[0] };
    }
  }
};

const currentPlatform = Object.values(PLATFORMS).find(p => p.matches(window.location.href)) || PLATFORMS.leetcode;

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let lastPushedSubmissionId = null;
let isProcessing = false;

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
(async function init() {
  console.log('[GitGrind] Initialized on problem page');
  
  // Periodically check and inject the button (for SPA navigation)
  setInterval(() => {
    injectHeaderButton();
  }, 2000);
  
  injectHeaderButton();
})();

// (Moved checkForAccepted logic into PLATFORMS registry)

// ─────────────────────────────────────────
// HANDLE MANUAL PUSH
// ─────────────────────────────────────────

async function handleManualPush() {
  if (isProcessing) return;
  const btnText = document.getElementById('gitgrind-btn-text');
  
  try {
    isProcessing = true;
    if (btnText) btnText.textContent = 'Pushing...';

    // Check settings
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    if (!settings.githubToken) {
      showToast('⚙️ GitGrind not set up yet. Click the extension icon.', 'warn');
      return;
    }

    // Extract solution data
    const payload = extractSolutionData();
    if (!payload || !payload.code) {
      showToast('⚠️ Could not extract code. Is there code in the editor?', 'warn');
      return;
    }

    // Prevent double-push of the same submission
    const submissionKey = `${payload.slug}-${payload.code.length}`;
    if (lastPushedSubmissionId === submissionKey) {
      showToast('⚠️ This exact code is already pushed.', 'warn');
      return;
    }
    lastPushedSubmissionId = submissionKey;

    showToast('⚡ Pushing to GitHub...', 'info');

    const result = await sendMessage({ type: 'PUSH_SOLUTION', payload });

    if (result.success) {
      showToast(`✅ Pushed! ${payload.title}`, 'success');
      if (btnText) btnText.textContent = 'Pushed ✓';
      setTimeout(() => { if (btnText) btnText.textContent = 'Push Code'; }, 3000);

      // Dispatch event so popup can update
      window.dispatchEvent(new CustomEvent('gitgrind-pushed', { detail: result }));
    } else {
      showToast(`❌ Push failed: ${result.error}`, 'error');
      if (btnText) btnText.textContent = 'Push Failed';
    }

  } catch (err) {
    console.error('[GitGrind] Push error:', err);
    showToast(`❌ Error: ${err.message}`, 'error');
    if (btnText) btnText.textContent = 'Error';
  } finally {
    isProcessing = false;
    setTimeout(() => { if (btnText && btnText.textContent !== 'Pushed ✓') btnText.textContent = 'Push Code'; }, 3000);
  }
}

// ─────────────────────────────────────────
// DATA EXTRACTION
// ─────────────────────────────────────────

/**
 * Extract all solution data from the page by delegating to the current platform strategy
 */
function extractSolutionData() {
  if (currentPlatform.extractSolutionData) {
    return currentPlatform.extractSolutionData();
  }

  // Fallback to old LeetCode hardcoded logic (since it relies on all the global helper functions below)
  try {
    const slug = getSlug();
    const code = extractCode();
    const title = extractTitle();
    const number = extractProblemNumber();
    const difficulty = extractDifficulty();
    const topics = extractTopics();
    const language = extractLanguage();
    const { runtime, memory } = extractRuntimeMemory();
    const problemStatement = extractProblemStatement();

    if (!code) {
      console.error('[GitGrind] Could not extract code');
      return null;
    }

    const payload = { slug, code, title, number, difficulty, topics, companies: [], sheets: [], contest: null, language, runtime, memory, problemStatement, problemUrl: `https://leetcode.com/problems/${slug}/` };
    console.log('[GitGrind] Extracted payload:', { slug, title, number, difficulty, language, hasStatement: !!problemStatement });
    return payload;

  } catch (err) {
    console.error('[GitGrind] Extraction error:', err);
    return null;
  }
}

/**
 * Get the problem slug from the URL
 */
function getSlug() {
  return window.location.pathname.split('/').filter(Boolean)[1] || 'unknown-problem';
}

/**
 * Extract code from Monaco Editor (multiple fallback methods)
 */
function extractCode() {
  // Method 1: Monaco Editor API (most reliable)
  try {
    const editors = window.monaco?.editor?.getEditors?.();
    if (editors && editors.length > 0) {
      const code = editors[0].getValue();
      if (code && code.trim().length > 0) {
        console.log('[GitGrind] Code extracted via Monaco API');
        return code;
      }
    }
  } catch (e) { /* try next method */ }

  // Method 2: Monaco model via global state
  try {
    const models = window.monaco?.editor?.getModels?.();
    if (models && models.length > 0) {
      // Find the largest model (most likely to be user code)
      const code = models.reduce((longest, m) => {
        const val = m.getValue();
        return val.length > longest.length ? val : longest;
      }, '');
      if (code.trim()) {
        console.log('[GitGrind] Code extracted via Monaco models');
        return code;
      }
    }
  } catch (e) { /* try next method */ }

  // Method 3: CodeMirror (older LeetCode versions)
  try {
    const cmEl = document.querySelector('.CodeMirror');
    if (cmEl?.CodeMirror) {
      const code = cmEl.CodeMirror.getValue();
      if (code.trim()) {
        console.log('[GitGrind] Code extracted via CodeMirror');
        return code;
      }
    }
  } catch (e) { /* try next method */ }

  // Method 4: Scrape Monaco DOM view lines
  try {
    const viewLines = document.querySelectorAll('.view-lines .view-line');
    if (viewLines.length > 0) {
      const code = Array.from(viewLines).map(line => {
        return Array.from(line.querySelectorAll('span')).map(s => s.textContent).join('');
      }).join('\n');
      if (code.trim()) {
        console.log('[GitGrind] Code extracted via DOM scraping');
        return code;
      }
    }
  } catch (e) { /* try next method */ }

  // Method 5: Look for code in submission result
  try {
    const codeEl = document.querySelector('[class*="code-area"] textarea, .monaco-editor textarea');
    if (codeEl?.value?.trim()) {
      console.log('[GitGrind] Code extracted via textarea');
      return codeEl.value;
    }
  } catch (e) { /* all methods failed */ }

  console.error('[GitGrind] All code extraction methods failed');
  return null;
}

/**
 * Extract problem title from DOM
 */
function extractTitle() {
  const selectors = [
    '[data-cy="question-title"]',
    'a[class*="no-underline"][class*="text-label"]',
    '.text-title-large a',
    'h4[class*="title"]',
    '.mr-2.text-label-1'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }

  // Fallback: derive from slug
  const slug = getSlug();
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Extract problem number from DOM or URL
 */
function extractProblemNumber() {
  // Strategy 1: Look for the title link that starts with a number and a dot
  const links = document.querySelectorAll('a[href^="/problems/"]');
  for (const link of links) {
    const text = link.textContent.trim();
    const match = text.match(/^(\d+)\.\s/);
    if (match) {
      return match[1];
    }
  }

  // Strategy 2: Look for the title element in older UI
  const titleEl = document.querySelector('[data-cy="question-title"]');
  if (titleEl) {
    const text = titleEl.textContent.trim();
    const match = text.match(/^(\d+)\./);
    if (match) return match[1];
    
    const parentText = titleEl.closest('[class*="title"]')?.textContent;
    const parentMatch = parentText?.match(/^(\d+)\./);
    if (parentMatch) return parentMatch[1];
  }

  // Strategy 3: Look for any h1 or h2 that might contain the title
  const headers = document.querySelectorAll('h1, h2');
  for (const h of headers) {
    const text = h.textContent.trim();
    const match = text.match(/^(\d+)\.\s/);
    if (match) return match[1];
  }

  // Strategy 4: Fallback to old selectors with strict exact match
  const selectors = [
    '[class*="question-title"] + [class*="truncate"]',
    '.text-label-3',
    '[class*="num_"]'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    if (text) {
      const match = text.match(/^(\d+)$/);
      if (match) return match[1];
    }
  }

  return '0000';
}

/**
 * Extract difficulty level
 */
function extractDifficulty() {
  const selectors = [
    '.text-difficulty-easy, .text-difficulty-medium, .text-difficulty-hard',
    '[diff]',
    '[class*="difficulty"]',
    '.text-olive, .text-yellow, .text-pink'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent.trim();
      if (['Easy', 'Medium', 'Hard'].includes(text)) return text;
    }
  }

  return 'Medium'; // Default fallback
}

/**
 * Extract topic tags
 */
function extractTopics() {
  const selectors = [
    '[class*="topic-tag"]',
    'a[class*="rounded-xl"]',
    '[class*="tag__"]',
    '.text-label-2[href*="/tag/"]'
  ];

  const topics = new Set();
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      const text = el.textContent.trim();
      if (text && text.length < 30 && !text.includes('(')) topics.add(text);
    });
  }

  return Array.from(topics).slice(0, 8);
}

/**
 * Extract current programming language
 */
function extractLanguage() {
  const selectors = [
    '[class*="lang-select"] button',
    'button[class*="language"]',
    '.ant-select-selection-item',
    '[id*="headlessui-menu-button"] span'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }

  return 'JavaScript'; // Default
}

/**
 * Extract runtime and memory from submission result
 */
function extractRuntimeMemory() {
  const resultSelectors = [
    '[data-e2e-locator="submission-runtime"]',
    '[class*="runtime"]',
    '.text-label-1'
  ];

  let runtime = null, memory = null;

  // Look for patterns like "0 ms" or "13.4 MB"
  const allText = document.body.innerText;
  const runtimeMatch = allText.match(/Runtime[\s\S]*?(\d+\s*ms)/i);
  const memoryMatch = allText.match(/Memory[\s\S]*?(\d+\.?\d*\s*MB)/i);

  if (runtimeMatch) runtime = runtimeMatch[1].trim();
  if (memoryMatch) memory = memoryMatch[1].trim();

  return { runtime, memory };
}

/**
 * Extract problem statement (raw HTML)
 */
function extractProblemStatement() {
  const selectors = [
    '[data-track-load="description_content"]',
    '.elfjS',
    '[class*="question-content"]',
    '.description__24sA'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerHTML) {
      return el.innerHTML.trim();
    }
  }

  return 'Problem statement not found.';
}

// ─────────────────────────────────────────
// HEADER BUTTON
// ─────────────────────────────────────────

function injectHeaderButton() {
  if (document.getElementById('gitgrind-push-btn')) return;

  const buttonSelectors = [
    // 1. Top navigation center bar (next to Submit/Run/Timer) - Always visible, user requested location
    () => {
      const submitBtn = document.querySelector('[data-e2e-locator="console-submit-button"]');
      if (submitBtn) {
        // LeetCode wraps Run and Submit in their own inner flex container.
        // We want the parent of that container (the main center action bar) so we don't break the layout.
        return submitBtn.parentElement.parentElement;
      }
      
      const anySubmit = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Submit');
      if (anySubmit) {
        return anySubmit.parentElement.parentElement;
      }
      
      return null;
    },
    // 2. Fallback: Next to "Ask Leet"
    () => {
      const btns = Array.from(document.querySelectorAll('div, button, span'));
      const askLeet = btns.find(b => b.textContent && b.textContent.includes('Ask Leet') && b.children.length === 0);
      if (askLeet) return askLeet.closest('.flex');
      return null;
    },
    // 3. Fallback: Code editor header
    () => {
      const header = document.querySelector('[class*="editor-header"]');
      if (header) return header.querySelector('.flex.items-center') || header;
      return null;
    }
  ];

  let container = null;
  for (const getContainer of buttonSelectors) {
    container = getContainer();
    if (container) break;
  }

  if (!container) return;

  const btn = document.createElement('button');
  btn.id = 'gitgrind-push-btn';
  // Match LeetCode's top navigation bar aesthetics perfectly
  btn.className = 'flex items-center justify-center gap-1.5 rounded bg-fill-secondary hover:bg-fill-secondary-hover text-text-secondary hover:text-text-primary text-sm font-medium transition-colors ml-2 px-3 py-1.5';
  
  btn.innerHTML = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
    <span id="gitgrind-btn-text" class="text-sm">Push Code</span>
  `;

  btn.addEventListener('click', handleManualPush);
  
  // Always append to the end of the container to ensure it's on the far right of the group
  container.appendChild(btn);
}

// ─────────────────────────────────────────
// MESSAGE LISTENER
// ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'MANUAL_PUSH') {
    handleManualPush();
    sendResponse({ success: true });
  }
});

// ─────────────────────────────────────────
// TOAST NOTIFICATIONS
// ─────────────────────────────────────────

let activeToast = null;

function showToast(message, type = 'info') {
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  const toast = document.createElement('div');
  toast.className = `gg-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  activeToast = toast;

  setTimeout(() => {
    toast.style.animation = 'gg-toast-out 0.3s ease forwards';
    setTimeout(() => { toast.remove(); if (activeToast === toast) activeToast = null; }, 300);
  }, 3500);
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) return resolve(document.querySelector(selector));
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}
