// ============================================================
// GitGrind — lib/folderStrategy.js
// Modular strategy-based architecture for generating repository paths
// ============================================================

const STRATEGIES = {
  platform: (payload) => {
    // Platform -> Difficulty -> Problem
    const platform = 'LeetCode'; // we can map from payload.problemUrl or payload.platform later
    const difficulty = payload.difficulty || 'Medium';
    return [\`\${platform}/\${difficulty}/\${payload.slug}\`];
  },
  
  topic: (payload) => {
    // Topics -> TopicName -> Problem
    const paths = [];
    if (payload.topics && payload.topics.length > 0) {
      for (const topic of payload.topics) {
        // format topic string to be folder friendly (e.g. "Hash Table" -> "Hash-Table")
        const safeTopic = topic.replace(/[^a-zA-Z0-9- ]/g, '').replace(/\\s+/g, '-');
        paths.push(\`Topics/\${safeTopic}/\${payload.slug}\`);
      }
    } else {
      paths.push(\`Topics/Uncategorized/\${payload.slug}\`);
    }
    return paths;
  },
  
  company: (payload) => {
    // Companies -> CompanyName -> Problem
    const paths = [];
    if (payload.companies && payload.companies.length > 0) {
      for (const comp of payload.companies) {
        const safeComp = comp.replace(/[^a-zA-Z0-9- ]/g, '').replace(/\\s+/g, '-');
        paths.push(\`Companies/\${safeComp}/\${payload.slug}\`);
      }
    }
    return paths;
  },

  language: (payload) => {
    // Languages -> LanguageName -> Problem
    const safeLang = payload.language.replace(/[^a-zA-Z0-9+#-]/g, '');
    return [\`Languages/\${safeLang}/\${payload.slug}\`];
  },

  contest: (payload) => {
    // Contests -> ContestName -> Problem
    if (payload.contest) {
      const safeContest = payload.contest.replace(/[^a-zA-Z0-9- ]/g, '').replace(/\\s+/g, '-');
      return [\`Contests/\${safeContest}/\${payload.slug}\`];
    }
    return [];
  },

  sheet: (payload) => {
    // Interview Sheets -> SheetName -> Problem
    const paths = [];
    if (payload.sheets && payload.sheets.length > 0) {
      for (const sheet of payload.sheets) {
        const safeSheet = sheet.replace(/[^a-zA-Z0-9- ]/g, '').replace(/\\s+/g, '-');
        paths.push(\`Interview-Sheets/\${safeSheet}/\${payload.slug}\`);
      }
    }
    return paths;
  },

  flat: (payload) => {
    // Flat LeetCode Structure (0001-two-sum/)
    const paddedNumber = String(payload.number).padStart(4, '0');
    return [\`\${paddedNumber}-\${payload.slug}\`];
  }
};

export class FolderStrategyEngine {
  constructor(enabledViews) {
    // Array of enabled view strings, e.g., ['platform', 'topic']
    // Fallback to 'platform' if empty
    this.enabledViews = enabledViews && enabledViews.length > 0 ? enabledViews : ['platform'];
  }

  generatePaths(payload) {
    const allPaths = new Set();
    
    for (const view of this.enabledViews) {
      const strategyFn = STRATEGIES[view];
      if (strategyFn) {
        const generated = strategyFn(payload);
        for (const path of generated) {
          allPaths.add(path);
        }
      }
    }

    // Default fallback if no paths generated
    if (allPaths.size === 0) {
      const paddedNumber = String(payload.number).padStart(4, '0');
      allPaths.add(\`problems/\${paddedNumber}-\${payload.slug}\`);
    }

    return Array.from(allPaths);
  }
}
