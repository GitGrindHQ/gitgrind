// ============================================================
// GitGrind — background.js (Service Worker)
// Handles: GitHub OAuth, GitHub API, Gemini API, Storage, Notifications
// ============================================================

console.log('[GitGrind] Background service worker started');

// ─────────────────────────────────────────
// CONSTANTS
// Update BACKEND_URL after deploying to Render
// ─────────────────────────────────────────
const BACKEND_URL = 'https://gitgrind-backend.onrender.com';

// ─────────────────────────────────────────
// INSTALL HOOK — open onboarding on first install
// ─────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    console.log('[GitGrind] First install — opening onboarding');
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ─────────────────────────────────────────
// MESSAGE ROUTER
// ─────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[GitGrind] Message received:', message.type);

  switch (message.type) {

    // Called by onboarding/options after launchWebAuthFlow completes
    case 'COMPLETE_OAUTH':
      completeOAuth(message.state)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'DISCONNECT_GITHUB':
      disconnectGitHub().then(sendResponse).catch(err =>
        sendResponse({ success: false, error: err.message })
      );
      break;

    case 'PUSH_SOLUTION':
      handlePushSolution(message.payload)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'GET_USER_REPOS':
      fetchUserRepos(message.token)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'CREATE_REPO':
      createRepo(message.token, message.repoName)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'VALIDATE_GEMINI_KEY':
      validateGeminiKey(message.key)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'ROAST_SOLUTION':
      roastSolution(message.payload)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'GET_STATS':
      getStats().then(sendResponse).catch(err =>
        sendResponse({ success: false, error: err.message })
      );
      break;

    case 'GET_SETTINGS':
      getSettings().then(sendResponse).catch(err =>
        sendResponse({ success: false, error: err.message })
      );
      break;

    case 'SAVE_SETTINGS':
      saveSettings(message.settings)
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    default:
      console.warn('[GitGrind] Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }

  return true; // Keep channel open for async
});

// ─────────────────────────────────────────
// GITHUB OAUTH — COMPLETE FLOW
// Called by extension pages after launchWebAuthFlow gives back
// the chromiumapp.org URL containing the state param.
// ─────────────────────────────────────────

/**
 * Step 2 of OAuth: fetch token from backend, validate with GitHub, save settings.
 * @param {string} state - The state param extracted from the chromiumapp.org redirect URL
 */
async function completeOAuth(state) {
  console.log('[GitGrind] Completing OAuth for state:', state.slice(0, 8) + '...');

  // 1. Retrieve the GitHub token from our backend (one-time use)
  let token;
  let attempts = 0;
  while (attempts < 4) {
    const tokenRes = await fetch(`${BACKEND_URL}/auth/token?state=${encodeURIComponent(state)}`);

    if (tokenRes.status === 404) {
      throw new Error('OAuth session expired. Please try connecting again.');
    }
    if (tokenRes.status === 202) {
      // Pending — tiny race condition, retry
      await sleep(600);
      attempts++;
      continue;
    }
    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}));
      throw new Error(err.error || `Backend error: ${tokenRes.status}`);
    }

    const data = await tokenRes.json();
    token = data.token;
    break;
  }

  if (!token) throw new Error('Could not retrieve token after retries. Try again.');

  // 2. Validate token with GitHub API and fetch user profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `token ${token}`,
      'Accept':        'application/vnd.github.v3+json',
      'User-Agent':    'GitGrind-Extension'
    }
  });

  if (!userRes.ok) {
    if (userRes.status === 401) throw new Error('GitHub rejected the token. Please try again.');
    throw new Error(`GitHub API error: ${userRes.status}`);
  }

  const user = await userRes.json();
  console.log('[GitGrind] OAuth completed for user:', user.login);

  // 3. Persist token + user info in settings
  const currentSettings = await getSettings();
  await saveSettings({
    ...currentSettings,
    githubToken:  token,
    githubUser:   user.login,
    githubName:   user.name  || user.login,
    githubAvatar: user.avatar_url,
    publicRepos:  user.public_repos
  });

  return {
    success: true,
    user: {
      login:       user.login,
      name:        user.name,
      avatar_url:  user.avatar_url,
      public_repos: user.public_repos
    }
  };
}

/**
 * Disconnect GitHub — clear token from settings
 */
async function disconnectGitHub() {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    githubToken:  null,
    githubUser:   null,
    githubName:   null,
    githubAvatar: null,
    repoFullName: null
  });
  return { success: true };
}

// ─────────────────────────────────────────
// GITHUB API FUNCTIONS
// ─────────────────────────────────────────

/**
 * Fetch all repos owned by the authenticated user
 */
async function fetchUserRepos(token) {
  console.log('[GitGrind] Fetching user repos...');
  const repos = [];
  let page = 1;

  while (true) {
    const response = await fetch(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept':        'application/vnd.github.v3+json',
          'User-Agent':    'GitGrind-Extension'
        }
      }
    );
    if (!response.ok) throw new Error(`Failed to fetch repos: ${response.status}`);
    const data = await response.json();
    repos.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return {
    success: true,
    repos: repos.map(r => ({
      name:        r.name,
      full_name:   r.full_name,
      private:     r.private,
      description: r.description,
      language:    r.language,
      updated_at:  r.updated_at
    }))
  };
}

/**
 * Create a new GitHub repository for the user
 */
async function createRepo(token, repoName) {
  console.log('[GitGrind] Creating repo:', repoName);
  const response = await fetch('https://api.github.com/user/repos', {
    method:  'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept':        'application/vnd.github.v3+json',
      'Content-Type':  'application/json',
      'User-Agent':    'GitGrind-Extension'
    },
    body: JSON.stringify({
      name:        repoName,
      description: '🚀 LeetCode solutions synced automatically by GitGrind',
      private:     false,
      auto_init:   true
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'Failed to create repo');
  }

  const repo = await response.json();
  return { success: true, repo: { name: repo.name, full_name: repo.full_name } };
}

/**
 * Get existing file SHA (required for updates via GitHub REST API)
 */
async function getFileSHA(token, owner, repo, path) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: {
          'Authorization': `token ${token}`,
          'Accept':        'application/vnd.github.v3+json',
          'User-Agent':    'GitGrind-Extension'
        }
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.sha;
  } catch {
    return null;
  }
}

/**
 * Push a file to GitHub via REST API (creates or updates)
 */
async function pushFileToGitHub(token, owner, repo, path, content, commitMessage) {
  console.log('[GitGrind] Pushing file:', path);

  const sha     = await getFileSHA(token, owner, repo, path);
  const encoded = btoa(unescape(encodeURIComponent(content)));

  const body = { message: commitMessage, content: encoded, branch: 'main' };
  if (sha) body.sha = sha;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method:  'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept':        'application/vnd.github.v3+json',
        'Content-Type':  'application/json',
        'User-Agent':    'GitGrind-Extension'
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.message || 'GitHub push failed');
  }

  const result = await response.json();
  return { success: true, url: result.content?.html_url, commit: result.commit?.sha };
}

// ─────────────────────────────────────────
// GEMINI API FUNCTIONS
// ─────────────────────────────────────────

/**
 * Validate a Gemini API key with a minimal test call
 */
async function validateGeminiKey(key) {
  console.log('[GitGrind] Validating Gemini key...');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${key}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ contents: [{ parts: [{ text: 'Say "ok"' }] }] })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Invalid Gemini API key');
  }
  return { success: true };
}

/**
 * Call Gemini 1.5 Flash with a text prompt
 */
async function callGemini(apiKey, prompt) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Gemini API call failed');
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Generate AI commit message via Gemini
 */
async function generateCommitMessage(settings, payload) {
  if (!settings.geminiKey || !settings.aiCommitMessages) return null;
  console.log('[GitGrind] Generating AI commit message...');

  const prompt = `You are a concise commit message generator for LeetCode solutions.

Generate ONE commit message line for:
- Problem: ${payload.title} (#${payload.number})
- Difficulty: ${payload.difficulty}
- Topics: ${payload.topics.join(', ')}
- Language: ${payload.language}
- Code (first 500 chars): ${payload.code.substring(0, 500)}

Format: solve(${payload.difficulty.toLowerCase()}): ${payload.slug} | [approach] | O(?) time O(?) space

Rules:
- Max 80 characters total
- Identify the main algorithm from the code
- Be specific about complexity
- Lowercase difficulty

Return ONLY the commit message line, nothing else.`;

  try {
    return (await callGemini(settings.geminiKey, prompt)).trim();
  } catch (err) {
    console.error('[GitGrind] Commit message generation failed:', err);
    return null;
  }
}

/**
 * Add AI inline comments to code
 */
async function addCodeComments(settings, payload) {
  if (!settings.geminiKey || !settings.addCodeComments) return payload.code;
  console.log('[GitGrind] Adding AI code comments...');

  const prompt = `Add concise, helpful inline comments to this ${payload.language} LeetCode solution for "${payload.title}".

Code:
\`\`\`
${payload.code}
\`\`\`

Rules:
- Comment the WHY, not the WHAT
- Keep each comment under 10 words
- Only comment key algorithmic steps
- Preserve all original code exactly
- Return ONLY the commented code, no markdown fences`;

  try {
    return (await callGemini(settings.geminiKey, prompt)).trim();
  } catch (err) {
    console.error('[GitGrind] Comment generation failed:', err);
    return payload.code;
  }
}

/**
 * Roast the solution — AI code review
 */
async function roastSolution(payload) {
  const settings = await getSettings();
  if (!settings.geminiKey) return { success: false, error: 'Gemini API key not configured' };

  console.log('[GitGrind] Roasting solution...');
  const prompt = `You are a senior software engineer reviewing a LeetCode solution. Be honest but constructive.

Problem: ${payload.title} (#${payload.number}) — ${payload.difficulty}
Topics: ${payload.topics.join(', ')}
Language: ${payload.language}

Code:
\`\`\`
${payload.code}
\`\`\`

Provide:
1. 🎯 **Approach** (1 sentence)
2. ⏱️ **Complexity**: Time O(?) | Space O(?)
3. 🔥 **What's Good** (1-2 bullets)
4. 💀 **The Roast** (direct about inefficiencies, 1-3 bullets)
5. ✨ **Better Approach** (if one exists)
6. 🏆 **Score**: X/10

Keep it sharp, under 250 words. Use emojis.`;

  try {
    const roast = await callGemini(settings.geminiKey, prompt);
    return { success: true, roast: roast.trim() };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────
// MAIN PUSH HANDLER
// ─────────────────────────────────────────

async function handlePushSolution(payload) {
  console.log('[GitGrind] Handling push for:', payload.title);

  const settings = await getSettings();
  if (!settings.githubToken || !settings.repoFullName) {
    throw new Error('GitGrind not configured. Please complete setup.');
  }

  const [owner, repo] = settings.repoFullName.split('/');

  // AI commit message
  let commitMessage = await generateCommitMessage(settings, payload);
  if (!commitMessage) {
    const template = settings.commitTemplate || 'solve({difficulty}): {slug} | {topics}';
    commitMessage = template
      .replace('{difficulty}', payload.difficulty.toLowerCase())
      .replace('{slug}', payload.slug)
      .replace('{topics}', payload.topics.slice(0, 2).join(', ') || payload.difficulty)
      .replace('{problem}', payload.title)
      .replace('{number}', payload.number);
  }

  // AI code comments
  let finalCode = payload.code;
  if (settings.addCodeComments && settings.geminiKey) {
    finalCode = await addCodeComments(settings, payload);
  }

  // Build file with header
  const solvedDate    = new Date().toISOString().split('T')[0];
  const fileExtension = getFileExtension(payload.language);
  const commentStyle  = getCommentStyle(payload.language);
  const fileHeader    = buildFileHeader(commentStyle, { ...payload, solvedDate });
  const fileContent   = `${fileHeader}\n\n${finalCode}\n`;

  // File path: problems/{difficulty}/{####}-{slug}/
  const difficulty   = payload.difficulty.toLowerCase();
  const paddedNumber = String(payload.number).padStart(4, '0');
  const basePath     = `problems/${difficulty}/${paddedNumber}-${payload.slug}`;
  const codeFilePath = `${basePath}/${payload.slug}.${fileExtension}`;
  const readmePath   = `${basePath}/README.md`;

  // Problem statement markdown
  const readmeContent = `# ${payload.title}

<h2><a href="https://leetcode.com/problems/${payload.slug}/">Original LeetCode Problem</a></h2>

${payload.problemStatement || 'Problem statement not found.'}
`;

  // Push both files concurrently
  const [pushResultCode, pushResultReadme] = await Promise.all([
    pushFileToGitHub(settings.githubToken, owner, repo, codeFilePath, fileContent, commitMessage),
    pushFileToGitHub(settings.githubToken, owner, repo, readmePath, readmeContent, commitMessage)
  ]);

  if (!pushResultCode.success) throw new Error(pushResultCode.error || 'Code push failed');
  if (!pushResultReadme.success) console.warn('[GitGrind] README push failed:', pushResultReadme.error);

  await updateStats(payload, pushResultCode.url);
  sendNotification('✅ Pushed to GitHub!', `${payload.title} → ${settings.repoFullName}`);

  console.log('[GitGrind] Push successful:', pushResultCode.url);
  return { success: true, url: pushResultCode.url, commitMessage, filePath: codeFilePath };
}

// ─────────────────────────────────────────
// STATS & STORAGE
// ─────────────────────────────────────────

async function updateStats(payload, githubUrl) {
  const stats = await getStats();
  const today = new Date().toISOString().split('T')[0];

  stats.total  = (stats.total  || 0) + 1;
  stats.easy   = (stats.easy   || 0) + (payload.difficulty === 'Easy'   ? 1 : 0);
  stats.medium = (stats.medium || 0) + (payload.difficulty === 'Medium' ? 1 : 0);
  stats.hard   = (stats.hard   || 0) + (payload.difficulty === 'Hard'   ? 1 : 0);

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (!stats.lastSolvedDate)         stats.streak = 1;
  else if (stats.lastSolvedDate === today)     { /* same day, no change */ }
  else if (stats.lastSolvedDate === yesterday) stats.streak = (stats.streak || 0) + 1;
  else                                          stats.streak = 1;
  stats.lastSolvedDate = today;

  stats.topics = stats.topics || {};
  for (const topic of payload.topics) stats.topics[topic] = (stats.topics[topic] || 0) + 1;

  const weekStart  = getWeekStart();
  const monthStart = new Date().toISOString().slice(0, 7);
  if (stats.weekStart  !== weekStart)  { stats.weekStart  = weekStart;  stats.thisWeek  = 0; }
  if (stats.monthStart !== monthStart) { stats.monthStart = monthStart; stats.thisMonth = 0; }
  stats.thisWeek  = (stats.thisWeek  || 0) + 1;
  stats.thisMonth = (stats.thisMonth || 0) + 1;

  stats.recentProblems = stats.recentProblems || [];
  stats.recentProblems.unshift({
    title: payload.title, number: payload.number, slug: payload.slug,
    difficulty: payload.difficulty, topics: payload.topics,
    url: githubUrl, solvedAt: new Date().toISOString()
  });
  if (stats.recentProblems.length > 10) stats.recentProblems.pop();

  stats.lastPushTime = Date.now();
  await chrome.storage.local.set({ gitgrind_stats: stats });
}

async function getStats() {
  const result = await chrome.storage.local.get('gitgrind_stats');
  return result.gitgrind_stats || {
    total: 0, easy: 0, medium: 0, hard: 0,
    streak: 0, thisWeek: 0, thisMonth: 0,
    topics: {}, recentProblems: [], lastSolvedDate: null
  };
}

async function getSettings() {
  const result = await chrome.storage.sync.get('gitgrind_settings');
  return result.gitgrind_settings || {
    githubToken: null, githubUser: null, githubName: null,
    githubAvatar: null, repoFullName: null, geminiKey: null,
    autoPush: true, aiCommitMessages: true, addCodeComments: false,
    showLinkedIn: true, commitTemplate: 'solve({difficulty}): {slug} | {topics}'
  };
}

async function saveSettings(settings) {
  await chrome.storage.sync.set({ gitgrind_settings: settings });
  return { success: true };
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────

function sendNotification(title, message) {
  chrome.notifications.create({
    type: 'basic', iconUrl: 'icons/icon128.png',
    title, message, priority: 2
  });
}

// ─────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────

function getFileExtension(language) {
  const map = {
    'JavaScript': 'js', 'TypeScript': 'ts', 'Python': 'py', 'Python3': 'py',
    'Java': 'java', 'C++': 'cpp', 'C': 'c', 'C#': 'cs',
    'Go': 'go', 'Rust': 'rs', 'Swift': 'swift', 'Kotlin': 'kt',
    'Ruby': 'rb', 'PHP': 'php', 'Scala': 'scala', 'Dart': 'dart'
  };
  return map[language] || 'txt';
}

function getCommentStyle(language) {
  return ['Python', 'Python3', 'Ruby'].includes(language) ? 'hash' : 'block';
}

function buildFileHeader(style, payload) {
  const lines = [
    `Problem: ${payload.title} (#${payload.number})`,
    `Difficulty: ${payload.difficulty}`,
    `Topics: ${payload.topics.join(', ') || 'N/A'}`,
    `Language: ${payload.language}`,
    `LeetCode URL: https://leetcode.com/problems/${payload.slug}/`,
    `Solved on: ${payload.solvedDate}`,
    payload.runtime ? `Runtime: ${payload.runtime} | Memory: ${payload.memory}` : null
  ].filter(Boolean);

  if (style === 'hash') {
    return '# ' + '='.repeat(58) + '\n' +
      lines.map(l => `# ${l}`).join('\n') + '\n' +
      '# ' + '='.repeat(58);
  }
  return '/*\n' + lines.map(l => ` * ${l}`).join('\n') + '\n */';
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(now.setDate(diff)).toISOString().split('T')[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
