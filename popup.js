// ============================================================
// GitGrind — popup.js  (Dashboard logic)
// ============================================================

'use strict';

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const [settings, stats] = await Promise.all([
    sendMessage({ type: 'GET_SETTINGS' }),
    sendMessage({ type: 'GET_STATS' })
  ]);

  if (!settings.githubToken || !settings.repoFullName) {
    showNotConfigured();
  } else {
    showDashboard(settings, stats);
    checkForRecentPush(stats);
  }

  setupButtons(settings, stats);
});

// ─────────────────────────────────────────
// DISPLAY STATES
// ─────────────────────────────────────────

function showNotConfigured() {
  document.getElementById('not-configured').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
}

function showDashboard(settings, stats) {
  document.getElementById('not-configured').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';

  renderStreak(stats);
  renderStats(stats);
  renderTopics(stats);
  renderRecentProblems(stats);
  renderRepoBar(settings);
}

// ─────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────

function renderStreak(stats) {
  document.getElementById('streak-count').textContent = stats.streak || 0;
  document.getElementById('this-week').textContent = `${stats.thisWeek || 0} this week`;
  document.getElementById('this-month').textContent = `${stats.thisMonth || 0} this month`;
}

function renderStats(stats) {
  const total = stats.total || 0;
  const easy = stats.easy || 0;
  const medium = stats.medium || 0;
  const hard = stats.hard || 0;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-easy').textContent = easy;
  document.getElementById('stat-medium').textContent = medium;
  document.getElementById('stat-hard').textContent = hard;

  // Animate progress bars
  if (total > 0) {
    setTimeout(() => {
      document.getElementById('bar-easy').style.width = `${Math.round((easy / total) * 100)}%`;
      document.getElementById('bar-medium').style.width = `${Math.round((medium / total) * 100)}%`;
      document.getElementById('bar-hard').style.width = `${Math.round((hard / total) * 100)}%`;
    }, 100);
  }
}

function renderTopics(stats) {
  const topics = stats.topics || {};
  const entries = Object.entries(topics).sort((a, b) => b[1] - a[1]);
  const container = document.getElementById('topics-list');
  const weaknessBadge = document.getElementById('weakness-badge');

  if (entries.length === 0) {
    container.innerHTML = '<div class="topics-empty">Solve problems to see topic breakdown</div>';
    return;
  }

  const maxCount = entries[0][1];
  const weakTopics = entries.filter(([, count]) => count <= 2);

  if (weakTopics.length > 0) {
    weaknessBadge.style.display = 'inline-block';
    weaknessBadge.title = `Weak areas: ${weakTopics.map(([t]) => t).join(', ')}`;
  }

  // Show top 6 topics
  container.innerHTML = entries.slice(0, 6).map(([topic, count]) => {
    const isWeak = count <= 2;
    const pct = Math.max(10, Math.round((count / maxCount) * 100));
    return `
      <div class="topic-row">
        <span class="topic-name">${topic}</span>
        <div class="topic-bar">
          <div class="topic-bar-fill ${isWeak ? 'weak' : ''}" style="width:${pct}%"></div>
        </div>
        <span class="topic-count">${count}</span>
        ${isWeak ? '<span class="topic-warn" title="Weak area — solve more!">⚠️</span>' : ''}
      </div>
    `;
  }).join('');
}

function renderRecentProblems(stats) {
  const problems = stats.recentProblems || [];
  const container = document.getElementById('recent-list');
  const countEl = document.getElementById('recent-count');

  if (problems.length === 0) {
    container.innerHTML = '<div class="recent-empty">No solutions pushed yet</div>';
    return;
  }

  countEl.textContent = `${problems.length} total`;

  container.innerHTML = problems.slice(0, 5).map(p => {
    const diff = (p.difficulty || 'medium').toLowerCase();
    const date = p.solvedAt ? new Date(p.solvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
    const topics = p.topics?.slice(0, 2).join(', ') || '';
    return `
      <a class="recent-item" href="${p.url || '#'}" target="_blank" title="${p.title}">
        <span class="recent-check">✅</span>
        <div class="recent-info">
          <div class="recent-title">${p.title}</div>
          <div class="recent-meta">${[topics, date].filter(Boolean).join(' · ')}</div>
        </div>
        <span class="diff-badge ${diff}">${p.difficulty}</span>
      </a>
    `;
  }).join('');
}

function renderRepoBar(settings) {
  const repoName = settings.repoFullName || 'Not configured';
  document.getElementById('repo-bar-name').textContent = repoName;

  const link = document.getElementById('repo-bar-link');
  if (settings.repoFullName) {
    link.href = `https://github.com/${settings.repoFullName}`;
  }
}

// ─────────────────────────────────────────
// CONFETTI — fires if a push happened recently
// ─────────────────────────────────────────

function checkForRecentPush(stats) {
  if (!stats.lastPushTime) return;
  const age = Date.now() - stats.lastPushTime;
  if (age < 15000 && typeof confetti !== 'undefined') {
    setTimeout(() => {
      const canvas = document.getElementById('confetti-canvas');
      const myConfetti = confetti.create(canvas, { resize: true });
      myConfetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.3 },
        colors: ['#7c3aed', '#a855f7', '#10b981', '#f59e0b'],
        ticks: 150,
        scalar: 0.8
      });
    }, 200);
  }
}

// ─────────────────────────────────────────
// BUTTON SETUP
// ─────────────────────────────────────────

function setupButtons(settings, stats) {
  // Settings button → open options page
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Setup button (not configured state)
  const setupBtn = document.getElementById('btn-setup');
  if (setupBtn) {
    setupBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
    });
  }

  // Push Now button
  document.getElementById('btn-push-now').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.url?.includes('leetcode.com/problems')) {
      showPopupToast('⚠️ Open a LeetCode problem page first!');
      return;
    }

    // Ask content script to trigger manual push
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'MANUAL_PUSH' });
      window.close();
    } catch {
      showPopupToast('⚠️ GitGrind is not active on this page. Refresh and try again.');
    }
  });

  // LinkedIn button
  const linkedinBtn = document.getElementById('btn-linkedin');
  if (settings.showLinkedIn && stats.recentProblems?.length > 0) {
    linkedinBtn.style.display = 'inline-flex';
    linkedinBtn.addEventListener('click', () => {
      const latest = stats.recentProblems[0];
      const text = encodeURIComponent(
        `Just solved ${latest.title} (${latest.difficulty}) on LeetCode! 🚀\n\nCheck my solution: ${latest.url || `https://github.com/${settings.repoFullName}`}\n\n#DSA #LeetCode #100DaysOfCode #Coding #GitGrind`
      );
      chrome.tabs.create({ url: `https://www.linkedin.com/shareArticle?mini=true&text=${text}` });
    });
  }
}

// ─────────────────────────────────────────
// POPUP TOAST
// ─────────────────────────────────────────

function showPopupToast(msg) {
  let toast = document.getElementById('popup-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'popup-toast';
    toast.style.cssText = `
      position: fixed; bottom: 12px; left: 16px; right: 16px;
      background: #1c2128; border: 1px solid #30363d; color: #e6edf3;
      padding: 9px 14px; border-radius: 8px; font-size: 12px; font-weight: 500;
      z-index: 9999; text-align: center; border-left: 3px solid #7c3aed;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ─────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || {});
    });
  });
}
