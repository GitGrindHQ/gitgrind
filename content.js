// ============================================================
// GitGrind — content.js
// Runs on: https://leetcode.com/problems/*
// Handles: Solution detection, code extraction, floating button
// ============================================================

console.log('[GitGrind] Content script loaded on:', window.location.href);

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let lastPushedSubmissionId = null;
let floatingBtn = null;
let isProcessing = false;

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
(async function init() {
  // Wait for DOM to be ready
  await waitForElement('body', 5000);

  // Inject floating ⚡ button
  injectFloatingButton();

  // Start observing for "Accepted" verdict
  startObserver();

  console.log('[GitGrind] Initialized on problem page');
})();

// ─────────────────────────────────────────
// MUTATION OBSERVER — watch for "Accepted"
// ─────────────────────────────────────────

function startObserver() {
  const observer = new MutationObserver(async (mutations) => {
    if (isProcessing) return;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length === 0) continue;

      // Check if any added node contains "Accepted" text
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        const text = node.textContent || '';
        const isAccepted = checkForAccepted(node);

        if (isAccepted) {
          console.log('[GitGrind] Accepted verdict detected!');
          await handleAcceptedSubmission();
          return;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: false
  });

  console.log('[GitGrind] MutationObserver started');
}

/**
 * Check if a DOM node contains an "Accepted" verdict
 */
function checkForAccepted(node) {
  // LeetCode uses various selectors — check multiple patterns
  const selectors = [
    '[data-e2e-locator="submission-result"]',
    '.text-green-s',
    '[class*="accepted"]',
    '[class*="Accepted"]',
    '.result__1l9i',
    '[class*="success"]'
  ];

  for (const sel of selectors) {
    const el = node.matches?.(sel) ? node : node.querySelector?.(sel);
    if (el && el.textContent.trim() === 'Accepted') return true;
  }

  // Fallback: check if the node itself has text "Accepted"
  if (node.textContent?.trim() === 'Accepted' &&
    (node.className?.includes('green') || node.className?.includes('success') ||
      node.className?.includes('accept'))) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────
// HANDLE ACCEPTED SUBMISSION
// ─────────────────────────────────────────

async function handleAcceptedSubmission() {
  if (isProcessing) return;
  isProcessing = true;
  floatingBtn?.classList.add('gg-btn-loading');

  try {
    // Small delay to let LeetCode render runtime/memory
    await sleep(1500);

    // Check settings
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    if (!settings.githubToken) {
      console.log('[GitGrind] Not configured, skipping auto-push');
      showToast('⚙️ GitGrind not set up yet. Click the extension icon.', 'warn');
      return;
    }

    if (!settings.autoPush) {
      console.log('[GitGrind] Auto-push disabled, showing manual button');
      showToast('✅ Accepted! Click ⚡ to push to GitHub', 'info');
      floatingBtn?.classList.add('gg-btn-ready');
      return;
    }

    // Extract solution data
    const payload = extractSolutionData();
    if (!payload) {
      showToast('⚠️ Could not extract solution. Try manual push.', 'warn');
      return;
    }

    // Prevent double-push of the same submission
    const submissionKey = `${payload.slug}-${payload.code.length}`;
    if (lastPushedSubmissionId === submissionKey) {
      console.log('[GitGrind] Duplicate submission detected, skipping');
      return;
    }
    lastPushedSubmissionId = submissionKey;

    showToast('⚡ Pushing to GitHub...', 'info');

    const result = await sendMessage({ type: 'PUSH_SOLUTION', payload });

    if (result.success) {
      showToast(`✅ Pushed! ${payload.title}`, 'success');
      floatingBtn?.classList.add('gg-btn-success');
      setTimeout(() => floatingBtn?.classList.remove('gg-btn-success'), 3000);

      // Dispatch event so popup can update
      window.dispatchEvent(new CustomEvent('gitgrind-pushed', { detail: result }));
    } else {
      showToast(`❌ Push failed: ${result.error}`, 'error');
    }

  } catch (err) {
    console.error('[GitGrind] Push error:', err);
    showToast(`❌ Error: ${err.message}`, 'error');
  } finally {
    isProcessing = false;
    floatingBtn?.classList.remove('gg-btn-loading');
  }
}

// ─────────────────────────────────────────
// DATA EXTRACTION
// ─────────────────────────────────────────

/**
 * Extract all solution data from the LeetCode page
 */
function extractSolutionData() {
  try {
    const slug = getSlug();
    const code = extractCode();
    const title = extractTitle();
    const number = extractProblemNumber();
    const difficulty = extractDifficulty();
    const topics = extractTopics();
    const language = extractLanguage();
    const { runtime, memory } = extractRuntimeMemory();

    if (!code) {
      console.error('[GitGrind] Could not extract code');
      return null;
    }

    const payload = { slug, code, title, number, difficulty, topics, language, runtime, memory };
    console.log('[GitGrind] Extracted payload:', { slug, title, number, difficulty, language });
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
  const selectors = [
    '[class*="question-title"] + [class*="truncate"]',
    '.text-label-3',
    '[class*="num_"]'
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const text = el?.textContent?.trim();
    const match = text?.match(/\d+/);
    if (match) return match[0];
  }

  // Fallback: try to get from title text that includes number
  const titleEl = document.querySelector('[data-cy="question-title"]');
  if (titleEl) {
    const parentText = titleEl.closest('[class*="title"]')?.textContent;
    const match = parentText?.match(/^(\d+)\./);
    if (match) return match[1];
  }

  return '0';
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

// ─────────────────────────────────────────
// FLOATING BUTTON
// ─────────────────────────────────────────

/**
 * Inject the floating ⚡ push button into the page
 */
function injectFloatingButton() {
  if (floatingBtn) return;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    .gg-float-btn {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7c3aed, #a855f7);
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 4px 24px rgba(124, 58, 237, 0.5);
      z-index: 999999;
      transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      outline: none;
    }
    .gg-float-btn:hover {
      transform: scale(1.12) translateY(-2px);
      box-shadow: 0 8px 32px rgba(124, 58, 237, 0.7);
    }
    .gg-float-btn:active { transform: scale(0.95); }
    .gg-float-btn.gg-btn-loading { animation: gg-pulse 1s infinite; }
    .gg-float-btn.gg-btn-success { background: linear-gradient(135deg, #059669, #10b981); }
    .gg-float-btn.gg-btn-ready { animation: gg-bounce 1s ease 2; }

    @keyframes gg-pulse {
      0%, 100% { box-shadow: 0 4px 24px rgba(124, 58, 237, 0.5); }
      50% { box-shadow: 0 4px 32px rgba(124, 58, 237, 0.9); transform: scale(1.05); }
    }
    @keyframes gg-bounce {
      0%, 100% { transform: translateY(0); }
      40% { transform: translateY(-8px); }
      60% { transform: translateY(-4px); }
    }

    .gg-toast {
      position: fixed;
      bottom: 88px;
      right: 24px;
      background: #161b22;
      border: 1px solid #30363d;
      color: #e6edf3;
      padding: 10px 16px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      font-size: 13px;
      font-weight: 500;
      z-index: 999998;
      max-width: 280px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      animation: gg-toast-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      border-left: 3px solid #7c3aed;
    }
    .gg-toast.success { border-left-color: #10b981; }
    .gg-toast.error { border-left-color: #ef4444; }
    .gg-toast.warn { border-left-color: #f59e0b; }

    @keyframes gg-toast-in {
      from { opacity: 0; transform: translateX(20px) scale(0.9); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes gg-toast-out {
      from { opacity: 1; transform: translateX(0); }
      to { opacity: 0; transform: translateX(20px); }
    }
  `;
  document.head.appendChild(style);

  // Create button
  floatingBtn = document.createElement('button');
  floatingBtn.className = 'gg-float-btn';
  floatingBtn.title = 'GitGrind — Push to GitHub';
  floatingBtn.innerHTML = '⚡';
  floatingBtn.setAttribute('aria-label', 'Push solution to GitHub');

  floatingBtn.addEventListener('click', async () => {
    console.log('[GitGrind] Manual push triggered');
    if (isProcessing) return;

    const payload = extractSolutionData();
    if (!payload || !payload.code) {
      showToast('⚠️ No code found. Solve a problem first!', 'warn');
      return;
    }

    isProcessing = true;
    floatingBtn.classList.add('gg-btn-loading');
    showToast('⚡ Pushing to GitHub...', 'info');

    try {
      const settings = await sendMessage({ type: 'GET_SETTINGS' });
      if (!settings.githubToken) {
        showToast('⚙️ Set up GitGrind first! Click the extension icon.', 'warn');
        return;
      }

      const result = await sendMessage({ type: 'PUSH_SOLUTION', payload });
      if (result.success) {
        showToast(`✅ Pushed! ${payload.title}`, 'success');
        floatingBtn.classList.add('gg-btn-success');
        setTimeout(() => floatingBtn.classList.remove('gg-btn-success'), 3000);
      } else {
        showToast(`❌ ${result.error || 'Push failed'}`, 'error');
      }
    } catch (err) {
      showToast(`❌ ${err.message}`, 'error');
    } finally {
      isProcessing = false;
      floatingBtn.classList.remove('gg-btn-loading');
    }
  });

  document.body.appendChild(floatingBtn);
  console.log('[GitGrind] Floating button injected');
}

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
