// ============================================================
// GitGrind — options.js  (Settings page)
// ============================================================

'use strict';

const BACKEND_URL = 'https://gitgrind-backend.onrender.com';

let currentSettings = {};
let allRepos        = [];
let isDirty         = false;

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadStats();
  setupNavigation();
  setupEventListeners();
});

// ─────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────
function setupNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      // Allow normal links (like GitHub Issues or email) to open properly
      if (item.hasAttribute('href')) return;
      
      e.preventDefault();
      activateSection(item.dataset.section);
    });
  });
}

function activateSection(id) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`nav-${id}`)?.classList.add('active');
  document.getElementById(`section-${id}`)?.classList.add('active');
}

// ─────────────────────────────────────────
// LOAD SETTINGS INTO UI
// ─────────────────────────────────────────
async function loadSettings() {
  currentSettings = await sendMessage({ type: 'GET_SETTINGS' });

  // ── GitHub connection status ──
  if (currentSettings.githubToken && currentSettings.githubUser) {
    showConnectedState(currentSettings);
  } else {
    showDisconnectedState();
  }

  // ── Repo display ──
  if (currentSettings.repoFullName) {
    document.getElementById('inp-repo').value     = currentSettings.repoFullName;
    document.getElementById('current-repo-display').textContent = currentSettings.repoFullName;
  }

  // ── Groq ──
  if (currentSettings.groqKey) {
    document.getElementById('inp-groq').value = currentSettings.groqKey;
    document.getElementById('inp-groq').classList.add('valid');
  }

  // ── Repo Views ──
  const views = currentSettings.repoViews || ['platform'];
  document.querySelectorAll('.repo-view-checkbox').forEach(cb => {
    cb.checked = views.includes(cb.value);
  });
  
  // ── Daily Goal ──
  if (currentSettings.dailyGoal) {
    document.getElementById('sel-daily-goal').value = currentSettings.dailyGoal.toString();
  }

  // ── Toggles ──
  document.getElementById('toggle-ai-commits').checked = !!currentSettings.aiCommitMessages;
  document.getElementById('toggle-ai-comments').checked = !!currentSettings.addCodeComments;
  document.getElementById('toggle-linkedin').checked    = currentSettings.showLinkedIn !== false;

  // ── Commit template ──
  document.getElementById('inp-commit-template').value =
    currentSettings.commitTemplate || 'solve({difficulty}): {slug} | {topics}';

  checkReadmeButton(currentSettings);
}

function showConnectedState(settings) {
  document.getElementById('card-connected').style.display     = 'block';
  document.getElementById('card-not-connected').style.display = 'none';
  document.getElementById('card-repo').style.display          = 'block';

  document.getElementById('gh-username').textContent = settings.githubName || `@${settings.githubUser}`;
  document.getElementById('gh-meta').textContent     = `@${settings.githubUser}`;

  const avatar = document.getElementById('gh-avatar');
  if (settings.githubUser) avatar.src = `https://github.com/${settings.githubUser}.png?size=80`;
}

function showDisconnectedState() {
  document.getElementById('card-connected').style.display     = 'none';
  document.getElementById('card-not-connected').style.display = 'block';
  document.getElementById('card-repo').style.display          = 'none';
}

// ─────────────────────────────────────────
// LOAD STATS
// ─────────────────────────────────────────
async function loadStats() {
  const stats = await sendMessage({ type: 'GET_STATS' });

  document.getElementById('ov-total').textContent  = stats.total  || 0;
  document.getElementById('ov-easy').textContent   = stats.easy   || 0;
  document.getElementById('ov-medium').textContent = stats.medium || 0;
  document.getElementById('ov-hard').textContent   = stats.hard   || 0;
  document.getElementById('ov-streak').textContent = stats.streak || 0;
  document.getElementById('ov-week').textContent   = stats.thisWeek || 0;

  const topics  = stats.topics || {};
  const entries = Object.entries(topics).sort((a, b) => b[1] - a[1]);
  const tableEl = document.getElementById('topics-table');

  if (entries.length === 0) {
    tableEl.innerHTML = '<div class="topics-empty">No data yet. Solve some problems!</div>';
  } else {
    const maxCount = entries[0][1];
    tableEl.innerHTML = entries.map(([topic, count]) => `
      <div class="topic-row">
        <span class="topic-name">${topic}</span>
        <div class="topic-bar">
          <div class="topic-bar-fill" style="width:${Math.max(5, Math.round((count / maxCount) * 100))}%"></div>
        </div>
        <span class="topic-count">${count}</span>
      </div>
    `).join('');
  }
}

// ─────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────
function setupEventListeners() {
  // ── GitHub section ──
  document.getElementById('btn-connect-opts').addEventListener('click', () => triggerOAuth(false));
  document.getElementById('btn-reconnect-oauth').addEventListener('click', () => triggerOAuth(false));
  document.getElementById('btn-disconnect').addEventListener('click', disconnectGitHub);
  document.getElementById('btn-browse-repos').addEventListener('click', toggleRepoBrowser);
  document.getElementById('btn-save-repo').addEventListener('click', saveRepo);
  document.getElementById('repo-browser-search').addEventListener('input', e => filterRepoBrowser(e.target.value));

  // ── Groq section ──
  document.getElementById('toggle-groq').addEventListener('click', () => {
    const inp = document.getElementById('inp-groq');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('btn-test-groq').addEventListener('click', testGroq);

  // ── README Generator ──
  document.getElementById('btn-generate-readme').addEventListener('click', () => startReadmeGeneration());
  document.getElementById('btn-close-readme').addEventListener('click', closeReadmeModal);
  document.getElementById('btn-regen-readme').addEventListener('click', () => startReadmeGeneration(true));
  document.getElementById('btn-publish-readme').addEventListener('click', publishReadme);

  // ── Mark dirty ──
  const watchIds = ['inp-groq', 'inp-commit-template',
    'toggle-ai-commits', 'toggle-ai-comments', 'toggle-linkedin', 'sel-daily-goal'];
  watchIds.forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener('input',  markDirty);
    el?.addEventListener('change', markDirty);
  });
  document.querySelectorAll('.repo-view-checkbox').forEach(cb => cb.addEventListener('change', markDirty));

  // ── Save ──
  document.getElementById('btn-save').addEventListener('click', saveAllSettings);

  // ── Stats ──
  document.getElementById('btn-reset-stats').addEventListener('click', async () => {
    if (confirm('Reset all local statistics? This cannot be undone.')) {
      await chrome.storage.local.remove('gitgrind_stats');
      showToast('Statistics reset!');
      await loadStats();
    }
  });
}

// ─────────────────────────────────────────
// GITHUB OAUTH — from options page
// ─────────────────────────────────────────
async function triggerOAuth() {
  const btn    = document.getElementById('btn-connect-opts') || document.getElementById('btn-reconnect-oauth');
  const result = document.getElementById('oauth-result');

  // Show loading state
  if (result) { result.style.display = 'none'; }

  try {
    // Generate state for CSRF
    const oauthState  = generateRandomState();
    const redirectUrl = chrome.identity.getRedirectURL('callback');

    const authUrl = `${BACKEND_URL}/auth/github?` + new URLSearchParams({
      state:        oauthState,
      redirect_url: redirectUrl
    }).toString();

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else if (!url)                reject(new Error('Cancelled'));
        else                          resolve(url);
      });
    });

    const parsed        = new URL(responseUrl);
    const returnedState = parsed.searchParams.get('state');
    const error         = parsed.searchParams.get('error');

    if (error || returnedState !== oauthState) {
      throw new Error(error || 'State mismatch');
    }

    const completeResult = await sendMessage({ type: 'COMPLETE_OAUTH', state: returnedState });
    if (!completeResult.success) throw new Error(completeResult.error);

    // Reload settings and update UI
    await loadSettings();
    showToast('✅ Connected as @' + completeResult.user.login);

  } catch (err) {
    if (result) {
      result.textContent    = `❌ ${err.message}`;
      result.className      = 'oauth-result error';
      result.style.display  = 'block';
    }
    showToast('❌ OAuth failed: ' + err.message);
  }
}

async function disconnectGitHub() {
  if (!confirm('Disconnect your GitHub account? You will need to reconnect to push solutions.')) return;
  await sendMessage({ type: 'DISCONNECT_GITHUB' });
  currentSettings = await sendMessage({ type: 'GET_SETTINGS' });
  showDisconnectedState();
  showToast('Disconnected from GitHub');
}

// ─────────────────────────────────────────
// REPO BROWSER
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// README GENERATOR
// ─────────────────────────────────────────

function checkReadmeButton(settings) {
  const btn = document.getElementById('btn-generate-readme');
  if (settings.groqKey && settings.githubToken && settings.repoFullName) {
    btn.disabled = false;
    btn.title = '';
  } else {
    btn.disabled = true;
    btn.title = 'Please configure GitHub and Groq API Key first';
  }
}

function startReadmeGeneration(isRegen = false) {
  document.getElementById('readme-modal').style.display = 'flex';
  document.getElementById('readme-loading').style.display = 'block';
  document.getElementById('readme-editor').style.display = 'none';
  document.getElementById('readme-footer').style.display = 'none';

  chrome.runtime.sendMessage({ type: 'GENERATE_README' }, (res) => {
    document.getElementById('readme-loading').style.display = 'none';
    if (res && res.success) {
      document.getElementById('readme-editor').value = res.readme;
      document.getElementById('readme-editor').style.display = 'block';
      document.getElementById('readme-footer').style.display = 'flex';
    } else {
      showToast('Error generating README: ' + (res?.error || 'Unknown error'), true);
      closeReadmeModal();
    }
  });
}

function closeReadmeModal() {
  document.getElementById('readme-modal').style.display = 'none';
}

function publishReadme() {
  const content = document.getElementById('readme-editor').value;
  const btn = document.getElementById('btn-publish-readme');
  btn.disabled = true;
  btn.textContent = 'Publishing...';

  chrome.runtime.sendMessage({ type: 'PUBLISH_README', content }, (res) => {
    btn.disabled = false;
    btn.textContent = 'Publish to GitHub';
    if (res && res.success) {
      showToast('README successfully published to GitHub!');
      closeReadmeModal();
    } else {
      showToast('Error publishing README: ' + (res?.error || 'Unknown error'), true);
    }
  });
}

async function toggleRepoBrowser() {
  const browser = document.getElementById('repo-browser');
  if (browser.style.display !== 'none') {
    browser.style.display = 'none';
    return;
  }

  browser.style.display = 'block';

  if (allRepos.length === 0) {
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    if (!settings.githubToken) return;

    const result = await sendMessage({ type: 'GET_USER_REPOS', token: settings.githubToken });
    if (result.success) {
      allRepos = result.repos;
      renderRepoBrowser(allRepos);
    }
  } else {
    renderRepoBrowser(allRepos);
  }
}

function renderRepoBrowser(repos) {
  const list = document.getElementById('repo-browser-list');
  if (!repos.length) {
    list.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted)">No repos found</div>';
    return;
  }

  list.innerHTML = repos.slice(0, 30).map(r => `
    <div class="repo-browser-item" data-full-name="${r.full_name}">
      ${r.private ? '🔒' : '📁'} <strong>${r.name}</strong>
      <span style="color:var(--text-muted);font-size:11px;margin-left:4px">${r.private ? 'Private' : 'Public'}</span>
    </div>
  `).join('');

  list.querySelectorAll('.repo-browser-item').forEach(item => {
    item.addEventListener('click', () => {
      const fullName = item.dataset.fullName;
      document.getElementById('inp-repo').value = fullName;
      document.getElementById('repo-browser').style.display = 'none';
      markDirty();
    });
  });
}

function filterRepoBrowser(query) {
  const q = query.toLowerCase();
  renderRepoBrowser(allRepos.filter(r => r.name.toLowerCase().includes(q)));
}

async function saveRepo() {
  const repoFullName = document.getElementById('inp-repo').value.trim();
  if (!repoFullName) { showToast('⚠️ Enter a repository name'); return; }

  const settings = await sendMessage({ type: 'GET_SETTINGS' });
  await sendMessage({ type: 'SAVE_SETTINGS', settings: { ...settings, repoFullName } });
  currentSettings.repoFullName = repoFullName;
  document.getElementById('current-repo-display').textContent = repoFullName;
  showToast('✅ Repository saved!');
}

// ─────────────────────────────────────────
// GROQ TEST
// ─────────────────────────────────────────
async function testGroq() {
  const key      = document.getElementById('inp-groq').value.trim();
  const resultEl = document.getElementById('test-groq-result');
  if (!key) { showTestResult(resultEl, '❌ Enter a key first', 'error'); return; }

  const btn       = document.getElementById('btn-test-groq');
  btn.textContent = 'Testing…';
  btn.disabled    = true;

  try {
    const result = await sendMessage({ type: 'VALIDATE_GROQ_KEY', key });
    if (result.success) {
      document.getElementById('inp-groq').classList.add('valid');
      showTestResult(resultEl, '✅ Groq is working!', 'success');
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    document.getElementById('inp-groq').classList.add('invalid');
    showTestResult(resultEl, `❌ ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Test Groq';
    btn.disabled    = false;
  }
}

// ─────────────────────────────────────────
// SAVE ALL SETTINGS
// ─────────────────────────────────────────
function markDirty() {
  isDirty = true;
  document.getElementById('save-bar').style.display = 'flex';
}

async function saveAllSettings() {
  const views = Array.from(document.querySelectorAll('.repo-view-checkbox:checked')).map(cb => cb.value);

  const settings = {
    ...currentSettings,
    groqKey:          document.getElementById('inp-groq').value.trim() || null,
    repoViews:        views.length > 0 ? views : ['platform'],
    dailyGoal:        parseInt(document.getElementById('sel-daily-goal').value, 10) || 5,
    aiCommitMessages: document.getElementById('toggle-ai-commits').checked,
    addCodeComments:  document.getElementById('toggle-ai-comments').checked,
    showLinkedIn:     document.getElementById('toggle-linkedin').checked,
    commitTemplate:   document.getElementById('inp-commit-template').value.trim() ||
      'solve({difficulty}): {slug} | {topics}'
  };

  await sendMessage({ type: 'SAVE_SETTINGS', settings });
  currentSettings = settings;
  isDirty         = false;
  document.getElementById('save-bar').style.display = 'none';
  showToast('✅ Settings saved!');
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────
function generateRandomState() {
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function showTestResult(el, msg, type) {
  el.textContent  = msg;
  el.className    = `test-result ${type}`;
  el.style.display = 'inline-block';
}

function showToast(msg) {
  const toast       = document.getElementById('toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, response => resolve(response || {}));
  });
}
