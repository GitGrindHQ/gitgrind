// ============================================================
// GitGrind — onboarding.js
// OAuth-based setup flow (no PAT required)
// ============================================================

'use strict';

// ─────────────────────────────────────────
// BACKEND URL — update after Render deploy
// ─────────────────────────────────────────
const BACKEND_URL = 'https://gitgrind-backend.onrender.com';

// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
const state = {
  githubToken: null,
  githubUser:  null,    // { login, name, avatar_url, public_repos }
  selectedRepo: null,
  groqKey:      null,
  repos:        [],
};

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  goToStep('welcome');
});

// ─────────────────────────────────────────
// STEP NAVIGATION
// ─────────────────────────────────────────
function goToStep(stepName, direction = 'right') {
  const currentEl = document.querySelector('.step.active');
  const nextEl    = document.getElementById(`step-${stepName}`);
  if (!nextEl) return;

  currentEl?.classList.remove('active');
  nextEl.classList.add('active');
  nextEl.classList.add(direction === 'right' ? 'slide-right' : 'slide-left');
  setTimeout(() => nextEl.classList.remove('slide-right', 'slide-left'), 400);

  // Progress dots
  const dots    = document.getElementById('progress-dots');
  const STEPS   = ['github', 'repo', 'groq', 'done'];
  const stepIdx = STEPS.indexOf(stepName);

  if (stepName === 'welcome' || stepName === 'done') {
    dots.style.display = 'none';
  } else {
    dots.style.display = 'flex';
    document.querySelectorAll('.dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === stepIdx);
    });
  }

  // Step-specific init
  if (stepName === 'repo')  setupRepoStep();
  if (stepName === 'done')  setupDoneStep();
}

// ─────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────
function setupEventListeners() {
  // Welcome → GitHub
  document.getElementById('btn-start').addEventListener('click', () => goToStep('github'));

  // ── GitHub OAuth step ──
  document.getElementById('btn-connect-github').addEventListener('click', startGitHubOAuth);
  document.getElementById('btn-retry-oauth').addEventListener('click', () => {
    setOAuthState('default');
    document.getElementById('error-github').style.display = 'none';
    document.getElementById('btn-retry-oauth').style.display = 'none';
    document.getElementById('btn-github-next').disabled = true;
  });
  document.getElementById('btn-github-next').addEventListener('click', () => goToStep('repo'));
  document.getElementById('btn-back-welcome').addEventListener('click', () => goToStep('welcome', 'left'));

  // ── Repo step ──
  document.getElementById('btn-back-github').addEventListener('click', () => goToStep('github', 'left'));
  document.getElementById('btn-next-groq').addEventListener('click', () => {
    if (state.selectedRepo) goToStep('groq');
  });
  document.getElementById('btn-deselect-repo').addEventListener('click', () => {
    state.selectedRepo = null;
    updateRepoSelection();
  });
  document.getElementById('btn-show-create').addEventListener('click', () => {
    const form = document.getElementById('create-repo-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btn-create-repo').addEventListener('click', createNewRepo);
  document.getElementById('repo-search').addEventListener('input', e => filterRepos(e.target.value));

  // ── Groq step ──
  document.getElementById('btn-toggle-groq').addEventListener('click', () => {
    const inp = document.getElementById('input-groq');
    inp.type  = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('btn-skip-groq').addEventListener('click', () => saveAndFinish());
  document.getElementById('btn-verify-groq').addEventListener('click', verifyGroqKey);

  // ── Done step ──
  document.getElementById('btn-finish').addEventListener('click', () => window.close());
}

// ─────────────────────────────────────────
// GITHUB OAUTH FLOW
// Uses chrome.identity.launchWebAuthFlow — no PAT needed
// ─────────────────────────────────────────

async function startGitHubOAuth() {
  setOAuthState('loading');
  document.getElementById('error-github').style.display = 'none';
  document.getElementById('btn-retry-oauth').style.display = 'none';

  try {
    const oauthState  = generateRandomState();
    const redirectUrl = chrome.identity.getRedirectURL('callback');
    console.log('[GitGrind] OAuth redirect URL:', redirectUrl);

    // Persist state BEFORE launching flow — used for recovery if Chrome
    // misses the chromiumapp.org redirect (the "did not approve" false positive)
    await chrome.storage.local.set({ pendingOAuthState: oauthState });

    const authUrl = `${BACKEND_URL}/auth/github?` + new URLSearchParams({
      state:        oauthState,
      redirect_url: redirectUrl
    }).toString();

    let responseUrl;
    try {
      responseUrl = await new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          { url: authUrl, interactive: true },
          (url) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!url) {
              reject(new Error('Authorization was cancelled.'));
            } else {
              resolve(url);
            }
          }
        );
      });
    } catch (flowError) {
      // Chrome can fire "The user did not approve access." even when the user
      // DID authorize — this happens when launchWebAuthFlow misses the
      // chromiumapp.org redirect (now fixed via JS redirect in backend, but
      // keeping this as a safety net).
      const isChromeFalsePositive =
        flowError.message.includes('did not approve') ||
        flowError.message.includes('cancelled');

      if (isChromeFalsePositive) {
        console.warn('[GitGrind] launchWebAuthFlow reported no approval — attempting token recovery...');
        const recovered = await tryRecoverToken(oauthState);
        if (recovered) return; // ✅ Auth actually succeeded
      }
      throw flowError;
    }

    // Clear persisted state — flow completed normally
    await chrome.storage.local.remove('pendingOAuthState');

    const parsedUrl     = new URL(responseUrl);
    const returnedState = parsedUrl.searchParams.get('state');
    const error         = parsedUrl.searchParams.get('error');

    if (error) {
      throw new Error(error === 'access_denied'
        ? 'You declined GitHub access. Please try again and click "Authorize".'
        : `GitHub error: ${error}`
      );
    }

    if (returnedState !== oauthState) {
      throw new Error('Security check failed (state mismatch). Please try again.');
    }

    const result = await sendMessage({ type: 'COMPLETE_OAUTH', state: returnedState });
    if (!result.success) throw new Error(result.error || 'Failed to complete authentication.');

    state.githubToken = true;
    state.githubUser  = result.user;
    showOAuthSuccess(result.user);

  } catch (err) {
    console.error('[GitGrind] OAuth error:', err.message);
    await chrome.storage.local.remove('pendingOAuthState');
    setOAuthState('default');
    showOAuthError(err.message);
  }
}

/**
 * Recovery: try to fetch token from backend using a stored state.
 * Called when launchWebAuthFlow reports failure but user may have authorized.
 */
async function tryRecoverToken(oauthState) {
  try {
    console.log('[GitGrind] Attempting recovery for state:', oauthState.slice(0, 8) + '...');
    const result = await sendMessage({ type: 'COMPLETE_OAUTH', state: oauthState });
    if (result.success) {
      await chrome.storage.local.remove('pendingOAuthState');
      state.githubToken = true;
      state.githubUser  = result.user;
      showOAuthSuccess(result.user);
      return true;
    }
  } catch (err) {
    console.warn('[GitGrind] Recovery failed:', err.message);
  }
  return false;
}

// ── OAuth UI state machine ──
function setOAuthState(mode) {
  // mode: 'default' | 'loading' | 'success'
  document.getElementById('oauth-default').style.display  = mode === 'default'  ? 'block' : 'none';
  document.getElementById('oauth-loading').style.display  = mode === 'loading'  ? 'block' : 'none';
  document.getElementById('oauth-success').style.display  = mode === 'success'  ? 'block' : 'none';
}

function showOAuthSuccess(user) {
  setOAuthState('success');
  document.getElementById('oauth-avatar').src       = user.avatar_url;
  document.getElementById('oauth-name').textContent  = user.name || user.login;
  document.getElementById('oauth-handle').textContent = `@${user.login} · ${user.public_repos} public repos`;
  document.getElementById('btn-github-next').disabled = false;
  // Auto-advance after a short pause
  setTimeout(() => goToStep('repo'), 900);
}

function showOAuthError(message) {
  const el          = document.getElementById('error-github');
  el.textContent    = `❌ ${message}`;
  el.style.display  = 'block';
  document.getElementById('btn-retry-oauth').style.display = 'block';
}

// ─────────────────────────────────────────
// REPO STEP
// ─────────────────────────────────────────

async function setupRepoStep() {
  if (state.repos.length > 0) {
    renderRepoList(state.repos);
    return;
  }

  // Fetch the token from storage to list repos
  const settings = await sendMessage({ type: 'GET_SETTINGS' });

  try {
    const result = await sendMessage({ type: 'GET_USER_REPOS', token: settings.githubToken });
    if (result.success) {
      state.repos = result.repos;
      renderRepoList(result.repos);
    } else {
      document.getElementById('repo-list').innerHTML =
        `<div class="repo-loading">❌ ${result.error || 'Failed to load repos'}</div>`;
    }
  } catch (err) {
    document.getElementById('repo-list').innerHTML =
      `<div class="repo-loading">❌ ${err.message}</div>`;
  }
}

function renderRepoList(repos) {
  const list = document.getElementById('repo-list');
  if (!repos || repos.length === 0) {
    list.innerHTML = '<div class="repo-loading">No repositories found.</div>';
    return;
  }

  list.innerHTML = repos.map(repo => `
    <div class="repo-item" data-full-name="${repo.full_name}" data-name="${repo.name}">
      <span class="repo-item-icon">${repo.private ? '🔒' : '📁'}</span>
      <div class="repo-item-info">
        <div class="repo-item-name">${repo.name}</div>
        <div class="repo-item-meta">${repo.description || 'No description'} · ${repo.language || 'Multiple'}</div>
      </div>
      ${repo.private ? '<span class="repo-item-private">Private</span>' : ''}
    </div>
  `).join('');

  list.querySelectorAll('.repo-item').forEach(item => {
    item.addEventListener('click', () => {
      state.selectedRepo = { name: item.dataset.name, full_name: item.dataset.fullName };
      updateRepoSelection();
    });
  });
}

function filterRepos(query) {
  const q       = query.toLowerCase();
  const filtered = state.repos.filter(r =>
    r.name.toLowerCase().includes(q) ||
    (r.description || '').toLowerCase().includes(q)
  );
  renderRepoList(filtered);
}

function updateRepoSelection() {
  const bar     = document.getElementById('selected-repo-bar');
  const nextBtn = document.getElementById('btn-next-groq');
  const nameEl  = document.getElementById('selected-repo-name');

  document.querySelectorAll('.repo-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.fullName === state.selectedRepo?.full_name);
  });

  if (state.selectedRepo) {
    nameEl.textContent    = state.selectedRepo.full_name;
    bar.style.display     = 'flex';
    nextBtn.disabled      = false;
  } else {
    bar.style.display     = 'none';
    nextBtn.disabled      = true;
  }
}

async function createNewRepo() {
  const name = document.getElementById('input-new-repo').value.trim();
  if (!name) return;

  const btn     = document.getElementById('btn-create-repo');
  btn.textContent = 'Creating…';
  btn.disabled    = true;

  try {
    const settings = await sendMessage({ type: 'GET_SETTINGS' });
    const result   = await sendMessage({ type: 'CREATE_REPO', token: settings.githubToken, repoName: name });

    if (result.success) {
      state.selectedRepo = { name: result.repo.name, full_name: result.repo.full_name };
      state.repos.unshift({ name: result.repo.name, full_name: result.repo.full_name, private: false, description: '🚀 LeetCode solutions' });
      renderRepoList(state.repos);
      updateRepoSelection();
      document.getElementById('create-repo-form').style.display = 'none';
    } else {
      alert('Failed to create repo: ' + result.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    btn.textContent = 'Create & Select';
    btn.disabled    = false;
  }
}

// ─────────────────────────────────────────
// GROQ STEP
// ─────────────────────────────────────────

async function verifyGroqKey() {
  const key = document.getElementById('input-groq').value.trim();
  if (!key) { saveAndFinish(); return; }

  setLoading('btn-verify-groq', 'groq-verify-text', 'groq-spinner', 'Verifying…', true);
  document.getElementById('error-groq').style.display = 'none';

  try {
    const result = await sendMessage({ type: 'VALIDATE_GROQ_KEY', key });
    if (result.success) {
      state.groqKey = key;
      document.getElementById('input-groq').classList.add('valid');
      document.getElementById('groq-status').style.display   = 'block';
      document.getElementById('groq-status').textContent = '✅ Groq AI activated!';
      setTimeout(() => saveAndFinish(), 1000);
    } else {
      throw new Error(result.error || 'Invalid key');
    }
  } catch (err) {
    document.getElementById('input-groq').classList.add('invalid');
    const el = document.getElementById('error-groq');
    el.textContent = `❌ ${err.message}`;
    el.style.display = 'block';
  } finally {
    setLoading('btn-verify-groq', 'groq-verify-text', 'groq-spinner', 'Verify & Finish', false);
  }
}

// ─────────────────────────────────────────
// SAVE & FINISH
// ─────────────────────────────────────────

async function saveAndFinish() {
  // Update settings with selected repo and optional Gemini key
  const currentSettings = await sendMessage({ type: 'GET_SETTINGS' });
  const newSettings = {
    ...currentSettings,
    repoFullName:      state.selectedRepo?.full_name || null,
    geminiKey:         null,
    groqKey:           state.groqKey || null,
    aiCommitMessages:  !!state.groqKey,
    addCodeComments:   false,
    autoPush:          true,
    showLinkedIn:      true,
    commitTemplate:    'solve({difficulty}): {slug} | {topics}'
  };

  await sendMessage({ type: 'SAVE_SETTINGS', settings: newSettings });
  goToStep('done');
}

// ─────────────────────────────────────────
// DONE STEP
// ─────────────────────────────────────────

async function setupDoneStep() {
  const settings = await sendMessage({ type: 'GET_SETTINGS' });
  document.getElementById('summary-user').textContent = `@${settings.githubUser || 'Unknown'}`;
  document.getElementById('summary-repo').textContent = settings.repoFullName   || '—';
  document.getElementById('summary-ai').textContent   = settings.groqKey ? '✅ Enabled (Groq)' : '❌ Not configured';
  setTimeout(() => fireConfetti(), 250);
}

function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas || typeof confetti === 'undefined') return;
  const myConfetti = confetti.create(canvas, { resize: true });
  myConfetti({
    particleCount: 130,
    spread: 90,
    origin: { y: 0.5 },
    colors: ['#7c3aed', '#a855f7', '#10b981', '#f59e0b', '#e6edf3'],
    ticks: 220
  });
}

// ─────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────

function generateRandomState() {
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function sendMessage(msg) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(msg, response => {
      resolve(response || { success: false, error: 'No response' });
    });
  });
}

function setLoading(btnId, textId, spinnerId, text, loading) {
  document.getElementById(btnId).disabled             = loading;
  document.getElementById(textId).textContent         = text;
  document.getElementById(spinnerId).style.display    = loading ? 'inline-block' : 'none';
}
