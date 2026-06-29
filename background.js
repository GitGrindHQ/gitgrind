// ============================================================
// GitGrind — background.js (Service Worker)
// Handles: GitHub OAuth, GitHub API, Gemini API, Storage, Notifications
// ============================================================

import { MetadataEngine } from './lib/metadataEngine.js';
import { FolderStrategyEngine } from './lib/folderStrategy.js';

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

    case 'VALIDATE_GROQ_KEY':
      validateGroqKey(message.key)
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

    case 'GENERATE_README':
      generateRepositoryReadme()
        .then(sendResponse)
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;

    case 'PUBLISH_README':
      publishRepositoryReadme(message.content)
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
 * Fetch the Metadata Index from the repository via Git Data API.
 */
async function fetchMetadataIndex(token, owner, repo, baseCommitSha) {
  try {
    const headers = {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'GitGrind-Extension'
    };

    const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, { headers });
    if (!commitRes.ok) return null;
    const commitData = await commitRes.json();
    
    const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commitData.tree.sha}?recursive=1`, { headers });
    if (!treeRes.ok) return null;
    const treeData = await treeRes.json();

    const indexEntry = treeData.tree.find(t => t.path === '.gitgrind/index.json');
    if (!indexEntry) return null;

    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${indexEntry.sha}`, { headers });
    if (!blobRes.ok) return null;
    const blobData = await blobRes.json();

    const content = decodeURIComponent(escape(atob(blobData.content)));
    return JSON.parse(content);
  } catch (err) {
    console.error('[GitGrind] Error fetching metadata index:', err);
    return null;
  }
}

/**
 * Push multiple files/paths efficiently using the Git Database API
 * Supports identical file references without duplicating blob content
 */
async function pushWithGitDatabaseAPI(token, owner, repo, files, commitMessage, baseCommitSha) {
  console.log('[GitGrind] Pushing via Git Database API...');
  
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'GitGrind-Extension'
  };

  const getCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${baseCommitSha}`, { headers });
  const commitData = await getCommitRes.json();
  const baseTreeSha = commitData.tree.sha;

  // Create Blobs for unique contents
  const uniqueContents = [...new Set(files.map(f => f.content))];
  const blobShaMap = new Map();
  
  for (const content of uniqueContents) {
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: unescape(encodeURIComponent(content)), encoding: 'base64' })
    });
    if (!blobRes.ok) throw new Error('Failed to create blob');
    const blobData = await blobRes.json();
    blobShaMap.set(content, blobData.sha);
  }

  // Create Tree
  const treeEntries = files.map(f => ({
    path: f.path,
    mode: '100644', // Normal file
    type: 'blob',
    sha: blobShaMap.get(f.content)
  }));

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
  });
  if (!treeRes.ok) throw new Error('Failed to create tree');
  const treeData = await treeRes.json();

  // Create Commit
  const newCommitRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: commitMessage, tree: treeData.sha, parents: [baseCommitSha] })
  });
  if (!newCommitRes.ok) throw new Error('Failed to create commit');
  const newCommitData = await newCommitRes.json();

  // Update Ref
  const updateRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommitData.sha, force: false })
  });
  if (!updateRefRes.ok) throw new Error('Failed to update branch reference');

  return { success: true, commit: newCommitData.sha, url: `https://github.com/${owner}/${repo}/commit/${newCommitData.sha}` };
}

// ─────────────────────────────────────────
// GROQ API FUNCTIONS
// ─────────────────────────────────────────

/**
 * Validate a Groq API key with a minimal test call
 */
async function validateGroqKey(key) {
  console.log('[GitGrind] Validating Groq key...');
  const response = await fetch(
    `https://api.groq.com/openai/v1/chat/completions`,
    {
      method:  'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Say "ok"' }]
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Invalid Groq API key');
  }
  return { success: true };
}

/**
 * Call Groq with a text prompt
 * @param {string} apiKey - Groq API Key
 * @param {string} prompt - The text prompt
 * @param {string} taskType - 'fast' (default) or 'high-quality'
 */
async function callGroq(apiKey, prompt, taskType = 'fast') {
  const model = taskType === 'high-quality' ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
  const maxTokens = taskType === 'high-quality' ? 4096 : 1024;

  const response = await fetch(
    `https://api.groq.com/openai/v1/chat/completions`,
    {
      method:  'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: maxTokens
      })
    }
  );
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Groq API call failed');
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Generate AI commit message via Groq
 */
async function generateCommitMessage(settings, payload) {
  if (!settings.groqKey || !settings.aiCommitMessages) return null;
  console.log('[GitGrind] Generating AI commit message...');

  const prompt = `You are a concise commit message generator for LeetCode solutions.

Generate ONE commit message line for:
- Problem: ${payload.title} (#${payload.number})
- Difficulty: ${payload.difficulty}
- Topics: ${payload.topics.join(', ')}
- Language: ${payload.language}
- Code (first 500 chars): ${payload.code.substring(0, 500)}

Format: [Emoji] solve(${payload.difficulty.toLowerCase()}): ${payload.slug} | [algorithm/approach] | O(?) time O(?) space

Rules:
- Max 80 characters total
- Infer the algorithm/technique used (e.g. DFS, HashMap, Sliding Window)
- Be specific about complexity
- Use a single relevant emoji at the start (e.g., ✨ for general, ⚡ for optimization, 🐍 for Python, 🚀 for Greedy, 🧠 for DP, 🎯 for Sliding Window, 🌳 for Trees)
- Return ONLY the commit message line, nothing else.`;

  try {
    return (await callGroq(settings.groqKey, prompt)).trim();
  } catch (err) {
    console.error('[GitGrind] Commit message generation failed:', err);
    return null;
  }
}

/**
 * Add AI inline comments to code
 */
async function addCodeComments(settings, payload) {
  if (!settings.groqKey || !settings.addCodeComments) return payload.code;
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
    let result = (await callGroq(settings.groqKey, prompt)).trim();
    // remove markdown fences if groq added them
    result = result.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
    return result;
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
  if (!settings.groqKey) return { success: false, error: 'Groq API key not configured' };

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
    const roast = await callGroq(settings.groqKey, prompt);
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
  
  // Get baseCommitSha first
  const getRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, { 
    headers: { 'Authorization': `token ${settings.githubToken}`, 'User-Agent': 'GitGrind-Extension' } 
  });
  if (!getRefRes.ok) throw new Error('Could not get main branch reference. Make sure the repo is not empty.');
  const refData = await getRefRes.json();
  const baseCommitSha = refData.object.sha;

  // Fetch or initialize Metadata Index
  let metadataIndex = { 
    schemaVersion: 1, 
    repositoryVersion: "1.0", 
    createdAt: new Date().toISOString(), 
    updatedAt: new Date().toISOString(),
    problems: {} 
  };
  const existingIndex = await fetchMetadataIndex(settings.githubToken, owner, repo, baseCommitSha);
  if (existingIndex && existingIndex.problems) {
    metadataIndex = existingIndex;
  }

  // Enrich Metadata
  const engine = new MetadataEngine(settings, callGroq);
  const enrichedPayload = await engine.enrich(payload);

  // AI commit message
  let commitMessage = await generateCommitMessage(settings, enrichedPayload);
  if (!commitMessage) {
    const template = settings.commitTemplate || 'solve({difficulty}): {slug} | {topics}';
    commitMessage = template
      .replace('{difficulty}', enrichedPayload.difficulty.toLowerCase())
      .replace('{slug}', enrichedPayload.slug)
      .replace('{topics}', enrichedPayload.topics.slice(0, 2).join(', ') || enrichedPayload.difficulty)
      .replace('{problem}', enrichedPayload.title)
      .replace('{number}', enrichedPayload.number);
  }

  // AI code comments
  let finalCode = enrichedPayload.code;
  if (settings.addCodeComments && settings.groqKey) {
    finalCode = await addCodeComments(settings, enrichedPayload);
  }

  // Build file with header
  const solvedDate    = new Date().toISOString().split('T')[0];
  const fileExtension = getFileExtension(enrichedPayload.language);
  const commentStyle  = getCommentStyle(enrichedPayload.language);
  const fileHeader    = buildFileHeader(commentStyle, { ...enrichedPayload, solvedDate });
  const fileContent   = `${fileHeader}\n\n${finalCode}\n`;

  // Folder Strategy mapping
  const strategyEngine = new FolderStrategyEngine(settings.repoViews || ['platform']);
  const generatedPaths = strategyEngine.generatePaths(enrichedPayload);

  const problemUrl = enrichedPayload.problemUrl || `https://leetcode.com/problems/${enrichedPayload.slug}/`;
  const readmeContent = `# ${enrichedPayload.title}

<h2><a href="${problemUrl}">Original Problem</a></h2>

${enrichedPayload.problemStatement || 'Problem statement not found.'}
`;

  // Prepare files for Git API
  const filesToPush = [];
  for (const basePath of generatedPaths) {
    filesToPush.push({ path: `${basePath}/${enrichedPayload.slug}.${fileExtension}`, content: fileContent });
    filesToPush.push({ path: `${basePath}/README.md`, content: readmeContent });
  }
  
  // Update Metadata Index with this problem
  metadataIndex.updatedAt = new Date().toISOString();
  metadataIndex.problems[enrichedPayload.slug] = {
    platform: enrichedPayload.platform || 'LeetCode',
    number: enrichedPayload.number,
    title: enrichedPayload.title,
    difficulty: enrichedPayload.difficulty,
    language: enrichedPayload.language,
    topics: enrichedPayload.topics,
    companies: enrichedPayload.companies || [],
    sheets: enrichedPayload.sheets || [],
    contest: enrichedPayload.contest || null,
    runtime: enrichedPayload.runtime || null,
    memory: enrichedPayload.memory || null,
    solvedAt: new Date().toISOString(),
    url: problemUrl,
    views: Array.from(generatedPaths),
    commitMessage: commitMessage
  };
  
  filesToPush.push({ path: '.gitgrind/index.json', content: JSON.stringify(metadataIndex, null, 2) });

  const pushResult = await pushWithGitDatabaseAPI(settings.githubToken, owner, repo, filesToPush, commitMessage, baseCommitSha);
  
  if (!pushResult.success) throw new Error(pushResult.error || 'Code push failed');

  await updateStats(enrichedPayload, pushResult.url, settings);
  await chrome.storage.local.set({ gitgrind_last_payload: enrichedPayload });

  sendNotification('✅ Pushed to GitHub!', `${enrichedPayload.title} → ${settings.repoFullName}`);

  console.log('[GitGrind] Push successful:', pushResult.url);
  return { success: true, url: pushResult.url, commitMessage, filePath: filesToPush[0].path };
}

// ─────────────────────────────────────────
// AI README GENERATOR
// ─────────────────────────────────────────

async function generateRepositoryReadme() {
  console.log('[GitGrind] Generating AI Repository README...');
  const settings = await getSettings();
  if (!settings.groqKey || !settings.githubToken || !settings.repoFullName) {
    throw new Error('GitGrind not fully configured or missing Groq API key.');
  }

  const [owner, repo] = settings.repoFullName.split('/');
  
  const getRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, { 
    headers: { 'Authorization': `token ${settings.githubToken}`, 'User-Agent': 'GitGrind-Extension' } 
  });
  if (!getRefRes.ok) throw new Error('Could not get main branch reference. Repository might be empty.');
  const refData = await getRefRes.json();
  const baseCommitSha = refData.object.sha;

  const metadataIndex = await fetchMetadataIndex(settings.githubToken, owner, repo, baseCommitSha);
  if (!metadataIndex || !metadataIndex.problems || Object.keys(metadataIndex.problems).length === 0) {
    throw new Error('No problems found in the Metadata Index. Sync some problems first!');
  }

  // Aggregate Stats
  let total = 0;
  const difficulties = { Easy: 0, Medium: 0, Hard: 0 };
  const languages = {};
  const topics = {};
  const companies = {};
  const sheets = {};

  for (const [slug, prob] of Object.entries(metadataIndex.problems)) {
    total++;
    if (prob.difficulty) difficulties[prob.difficulty] = (difficulties[prob.difficulty] || 0) + 1;
    if (prob.language) languages[prob.language] = (languages[prob.language] || 0) + 1;
    
    if (prob.topics) prob.topics.forEach(t => topics[t] = (topics[t] || 0) + 1);
    if (prob.companies) prob.companies.forEach(c => companies[c] = (companies[c] || 0) + 1);
    if (prob.sheets) prob.sheets.forEach(s => sheets[s] = (sheets[s] || 0) + 1);
  }

  const localStats = await getStats();

  const prompt = `You are an expert developer relations engineer. Write a highly professional, beautiful GitHub README.md for my competitive programming repository.

Here are the statistics of my solved problems:
- Total Solved: ${total}
- Difficulty Breakdown: Easy (${difficulties.Easy}), Medium (${difficulties.Medium}), Hard (${difficulties.Hard})
- Languages Used: ${Object.entries(languages).map(([k, v]) => \`\${k} (\${v})\`).join(', ')}
- Top Topics: ${Object.entries(topics).sort((a,b) => b[1]-a[1]).slice(0, 10).map(t => t[0]).join(', ')}
- Interview Sheets Completed: ${Object.keys(sheets).join(', ') || 'None'}
- Current Streak: ${localStats.streak || 0} days
- Daily Goal: ${settings.dailyGoal ? \`\${settings.dailyGoal} problems/day\` : 'Not set'}

Requirements:
- Use beautiful markdown formatting (headers, tables, lists, blockquotes).
- Include GitHub-style badges (using https://img.shields.io/badge/...).
- Sections to include: Repository Title, Description, Features, Supported Platforms, Repository Structure, Statistics, Recent Activity.
- Add emojis where appropriate.
- Include a footer mentioning that the repository is maintained automatically by the GitGrind Chrome Extension.
- DO NOT wrap the output in markdown code fences (\`\`\`markdown). Output raw markdown.`;

  try {
    const readmeContent = (await callGroq(settings.groqKey, prompt, 'high-quality')).trim();
    return { success: true, readme: readmeContent };
  } catch (err) {
    throw new Error('Failed to generate README via Groq: ' + err.message);
  }
}

async function publishRepositoryReadme(content) {
  console.log('[GitGrind] Publishing Repository README...');
  const settings = await getSettings();
  if (!settings.githubToken || !settings.repoFullName) {
    throw new Error('GitGrind not fully configured.');
  }

  const [owner, repo] = settings.repoFullName.split('/');
  
  const getRefRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/main`, { 
    headers: { 'Authorization': `token ${settings.githubToken}`, 'User-Agent': 'GitGrind-Extension' } 
  });
  if (!getRefRes.ok) throw new Error('Could not get main branch reference.');
  const refData = await getRefRes.json();
  const baseCommitSha = refData.object.sha;

  const filesToPush = [{ path: 'README.md', content: content }];
  const commitMessage = '📝 docs: Generate AI Repository README';

  const pushResult = await pushWithGitDatabaseAPI(settings.githubToken, owner, repo, filesToPush, commitMessage, baseCommitSha);
  
  if (!pushResult.success) throw new Error(pushResult.error || 'README publish failed');

  return { success: true, url: pushResult.url };
}

// ─────────────────────────────────────────
// STATS & STORAGE
// ─────────────────────────────────────────

async function updateStats(payload, githubUrl, settings) {
  const stats = await getStats();
  const today = new Date().toISOString().split('T')[0];

  stats.total  = (stats.total  || 0) + 1;
  stats.easy   = (stats.easy   || 0) + (payload.difficulty === 'Easy'   ? 1 : 0);
  stats.medium = (stats.medium || 0) + (payload.difficulty === 'Medium' ? 1 : 0);
  stats.hard   = (stats.hard   || 0) + (payload.difficulty === 'Hard'   ? 1 : 0);

  // Daily Goal Logic
  if (stats.lastSolvedDate !== today) {
    stats.todaySolved = 0;
  }
  stats.todaySolved = (stats.todaySolved || 0) + 1;
  
  if (stats.todaySolved === settings.dailyGoal) {
    sendNotification('🎯 Daily Goal Met!', `You reached your goal of ${settings.dailyGoal} problems today. Keep grinding!`);
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (!stats.lastSolvedDate)         stats.streak = 1;
  else if (stats.lastSolvedDate === today)     { /* same day, no change */ }
  else if (stats.lastSolvedDate === yesterday) stats.streak = (stats.streak || 0) + 1;
  else                                          stats.streak = 1;
  
  stats.longestStreak = Math.max(stats.longestStreak || 0, stats.streak);
  stats.lastSolvedDate = today;

  stats.topics = stats.topics || {};
  for (const topic of payload.topics) stats.topics[topic] = (stats.topics[topic] || 0) + 1;

  stats.languages = stats.languages || {};
  stats.languages[payload.language] = (stats.languages[payload.language] || 0) + 1;

  stats.companies = stats.companies || {};
  if (payload.companies) {
    for (const company of payload.companies) stats.companies[company] = (stats.companies[company] || 0) + 1;
  }

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
    streak: 0, longestStreak: 0, todaySolved: 0,
    thisWeek: 0, thisMonth: 0,
    topics: {}, languages: {}, companies: {}, 
    recentProblems: [], lastSolvedDate: null
  };
}

async function getSettings() {
  const result = await chrome.storage.sync.get('gitgrind_settings');
  return result.gitgrind_settings || {
    githubToken: null, githubUser: null, githubName: null,
    githubAvatar: null, repoFullName: null, groqKey: null,
    aiCommitMessages: true, addCodeComments: false, 
    repoViews: ['platform'], dailyGoal: 5,
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
    'Ruby': 'rb', 'PHP': 'php', 'Scala': 'scala', 'Dart': 'dart',
    'SQL': 'sql', 'MySQL': 'sql', 'PostgreSQL': 'sql', 'Oracle': 'sql'
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
