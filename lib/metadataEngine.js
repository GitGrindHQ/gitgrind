// ============================================================
// GitGrind — lib/metadataEngine.js
// Hybrid metadata engine: Deterministic sheets + AI fallback
// ============================================================

const SHEETS = {
  'blind-75': {
    name: 'Blind 75',
    problems: new Set([
      'two-sum', 'longest-substring-without-repeating-characters', 'longest-palindromic-substring',
      'container-with-most-water', '3sum', 'remove-nth-node-from-end-of-list', 'valid-parentheses',
      'merge-two-sorted-lists', 'merge-k-sorted-lists', 'search-in-rotated-sorted-array',
      'combination-sum', 'rotate-image', 'group-anagrams', 'maximum-subarray', 'spiral-matrix',
      'jump-game', 'merge-intervals', 'insert-interval', 'unique-paths', 'climbing-stairs',
      'set-matrix-zeroes', 'minimum-window-substring', 'word-search', 'decode-ways',
      'validate-binary-search-tree', 'same-tree', 'binary-tree-level-order-traversal',
      'maximum-depth-of-binary-tree', 'construct-binary-tree-from-preorder-and-inorder-traversal',
      'best-time-to-buy-and-sell-stock', 'binary-tree-maximum-path-sum', 'valid-palindrome',
      'longest-consecutive-sequence', 'clone-graph', 'word-break', 'linked-list-cycle',
      'reorder-list', 'maximum-product-subarray', 'find-minimum-in-rotated-sorted-array',
      'reverse-bits', 'number-of-1-bits', 'house-robber', 'number-of-islands', 'reverse-linked-list',
      'course-schedule', 'implement-trie-prefix-tree', 'design-add-and-search-words-data-structure',
      'word-search-ii', 'house-robber-ii', 'contains-duplicate', 'invert-binary-tree',
      'kth-smallest-element-in-a-bst', 'lowest-common-ancestor-of-a-binary-search-tree',
      'lowest-common-ancestor-of-a-binary-tree', 'product-of-array-except-self', 'valid-anagram',
      'meeting-rooms', 'meeting-rooms-ii', 'graph-valid-tree', 'missing-number', 'alien-dictionary',
      'encode-and-decode-strings', 'find-median-from-data-stream', 'longest-increasing-subsequence',
      'coin-change', 'number-of-connected-components-in-an-undirected-graph', 'counting-bits',
      'top-k-frequent-elements', 'sum-of-two-integers', 'pacific-atlantic-water-flow',
      'longest-repeating-character-replacement', 'non-overlapping-intervals',
      'serialize-and-deserialize-bst', 'subtree-of-another-tree', 'palindromic-substrings'
    ])
  },
  'neetcode-150': {
    name: 'NeetCode 150',
    problems: new Set([
      'two-sum', 'valid-anagram', 'contains-duplicate', 'group-anagrams', 'top-k-frequent-elements',
      'encode-and-decode-strings', 'product-of-array-except-self', 'valid-sudoku', 'longest-consecutive-sequence',
      'valid-palindrome', 'two-sum-ii-input-array-is-sorted', '3sum', 'container-with-most-water',
      'trapping-rain-water', 'best-time-to-buy-and-sell-stock', 'longest-substring-without-repeating-characters',
      'longest-repeating-character-replacement', 'permutation-in-string', 'minimum-window-substring',
      'sliding-window-maximum', 'valid-parentheses', 'min-stack', 'evaluate-reverse-polish-notation',
      'generate-parentheses', 'daily-temperatures', 'car-fleet', 'largest-rectangle-in-histogram',
      'binary-search', 'search-a-2d-matrix', 'koko-eating-bananas', 'find-minimum-in-rotated-sorted-array',
      'search-in-rotated-sorted-array', 'time-based-key-value-store', 'median-of-two-sorted-arrays',
      'reverse-linked-list', 'merge-two-sorted-lists', 'reorder-list', 'remove-nth-node-from-end-of-list',
      'copy-list-with-random-pointer', 'add-two-numbers', 'linked-list-cycle', 'find-the-duplicate-number',
      'lru-cache', 'merge-k-sorted-lists', 'reverse-nodes-in-k-group', 'invert-binary-tree',
      'maximum-depth-of-binary-tree', 'diameter-of-binary-tree', 'balanced-binary-tree', 'same-tree',
      'subtree-of-another-tree', 'lowest-common-ancestor-of-a-binary-search-tree', 'binary-tree-level-order-traversal',
      'binary-tree-right-side-view', 'count-good-nodes-in-binary-tree', 'validate-binary-search-tree',
      'kth-smallest-element-in-a-bst', 'construct-binary-tree-from-preorder-and-inorder-traversal',
      'binary-tree-maximum-path-sum', 'serialize-and-deserialize-binary-tree', 'implement-trie-prefix-tree',
      'design-add-and-search-words-data-structure', 'word-search-ii', 'kth-largest-element-in-a-stream',
      'last-stone-weight', 'k-closest-points-to-origin', 'kth-largest-element-in-an-array',
      'task-scheduler', 'design-twitter', 'find-median-from-data-stream', 'subsets', 'combination-sum',
      'permutations', 'subsets-ii', 'combination-sum-ii', 'word-search', 'palindrome-partitioning',
      'letter-combinations-of-a-phone-number', 'n-queens', 'number-of-islands', 'max-area-of-island',
      'clone-graph', 'walls-and-gates', 'rotting-oranges', 'pacific-atlantic-water-flow', 'surrounded-regions',
      'course-schedule', 'course-schedule-ii', 'redundant-connection', 'number-of-connected-components-in-an-undirected-graph',
      'graph-valid-tree', 'word-ladder', 'reconstruct-itinerary', 'min-cost-to-connect-all-points',
      'network-delay-time', 'swim-in-rising-water', 'alien-dictionary', 'cheapest-flights-within-k-stops',
      'climbing-stairs', 'min-cost-climbing-stairs', 'house-robber', 'house-robber-ii', 'longest-palindromic-substring',
      'palindromic-substrings', 'decode-ways', 'coin-change', 'maximum-product-subarray', 'word-break',
      'longest-increasing-subsequence', 'partition-equal-subset-sum', 'unique-paths', 'longest-common-subsequence',
      'best-time-to-buy-and-sell-stock-with-cooldown', 'coin-change-ii', 'target-sum', 'interleaving-string',
      'longest-increasing-path-in-a-matrix', 'distinct-subsequences', 'edit-distance', 'burst-balloons',
      'regular-expression-matching', 'maximum-subarray', 'jump-game', 'jump-game-ii', 'gas-station',
      'hand-of-straights', 'merge-triplets-to-form-target-triplet', 'partition-labels', 'valid-parenthesis-string',
      'insert-interval', 'merge-intervals', 'non-overlapping-intervals', 'meeting-rooms', 'meeting-rooms-ii',
      'minimum-interval-to-include-each-query', 'single-number', 'number-of-1-bits', 'counting-bits',
      'reverse-bits', 'missing-number', 'sum-of-two-integers', 'reverse-integer', 'plus-one', 'powx-n',
      'multiply-strings', 'detect-squares', 'happy-number', 'set-matrix-zeroes', 'spiral-matrix', 'rotate-image'
    ])
  }
};

const COMMON_COMPANIES = {
  'Amazon': ['two-sum', 'lru-cache', 'number-of-islands', 'merge-intervals', 'best-time-to-buy-and-sell-stock'],
  'Google': ['two-sum', 'longest-substring-without-repeating-characters', 'median-of-two-sorted-arrays'],
  'Meta': ['two-sum', 'add-two-numbers', 'lru-cache', 'valid-palindrome', 'merge-intervals'],
  'Microsoft': ['two-sum', 'lru-cache', 'merge-intervals', 'longest-substring-without-repeating-characters']
};

export class MetadataEngine {
  constructor(settings, groqCallFn) {
    this.settings = settings;
    this.callGroq = groqCallFn;
  }

  async enrich(payload) {
    const slug = payload.slug.toLowerCase();
    
    // 1. Determine Interview Sheets deterministically
    payload.sheets = [];
    for (const [id, sheet] of Object.entries(SHEETS)) {
      if (sheet.problems.has(slug)) {
        payload.sheets.push(sheet.name);
      }
    }

    // 2. Determine Companies deterministically (fallback map)
    payload.companies = payload.companies || [];
    for (const [company, problems] of Object.entries(COMMON_COMPANIES)) {
      if (problems.includes(slug) && !payload.companies.includes(company)) {
        payload.companies.push(company);
      }
    }

    // 3. Fallback to AI for missing Topics/Companies if enabled
    if (this.settings.groqKey && (payload.topics.length === 0 || payload.companies.length === 0)) {
      try {
        const prompt = `Extract LeetCode problem metadata.
Problem: ${payload.title} (${payload.slug})
Code: ${payload.code.substring(0, 300)}...

Return a raw JSON object (NO markdown fences, NO explanation) matching this schema:
{
  "topics": ["Array", "Dynamic Programming"], // Provide 1-3 topics
  "companies": ["Amazon", "Google"] // Provide 0-2 likely companies
}`;
        
        const responseText = await this.callGroq(this.settings.groqKey, prompt);
        const cleanJson = responseText.replace(/^\\s*\`\`\`json/i, '').replace(/\\s*\`\`\`\\s*$/i, '').trim();
        const aiMetadata = JSON.parse(cleanJson);
        
        if (payload.topics.length === 0 && Array.isArray(aiMetadata.topics)) {
          payload.topics = aiMetadata.topics;
        }
        if (payload.companies.length === 0 && Array.isArray(aiMetadata.companies)) {
          payload.companies = [...new Set([...payload.companies, ...aiMetadata.companies])];
        }
      } catch (err) {
        console.warn('[GitGrind] AI metadata enrichment failed:', err.message);
      }
    }

    // Default fallbacks
    if (payload.topics.length === 0) payload.topics = ['Uncategorized'];
    
    // Format Contest Name (if slug looks like a contest or we can parse it)
    if (payload.contest) {
      // Retain passed contest
    } else if (slug.includes('weekly')) {
      payload.contest = 'Weekly Contest';
    } else {
      payload.contest = null; // Uncategorized
    }

    return payload;
  }
}
