# Privacy Policy

**Last Updated:** June 2026

GitGrind ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how our Chrome Extension collects, uses, and safeguards your data.

## 1. Information We Collect

GitGrind is designed with a privacy-first approach. We collect the absolute minimum data required to provide our service:

*   **GitHub Authentication Token:** When you connect your GitHub account via OAuth, we receive an authentication token. This token is securely stored locally in your browser and is only used to interact with the GitHub API on your behalf (to list repositories and push code).
*   **LeetCode Submissions:** We extract your code, problem title, difficulty, and runtime statistics from your browser when you successfully solve a problem on LeetCode.

## 2. How We Use Your Information

The information we collect is used strictly for the core functionality of the extension:

*   To sync your LeetCode solutions directly to your connected GitHub repository.
*   To track your local statistics (e.g., streak, total solved) locally on your device.

## 3. Data Storage and Security

*   **Local Storage:** All your data, including your GitHub token and solving statistics, is stored locally in your browser using the Chrome Storage API.
*   **No Central Database:** We do not have a central database. We do not store, view, or have access to your code, GitHub token, or personal information on our servers.
*   **Backend Server:** Our minimal backend (`gitgrind-backend`) is used exclusively for the OAuth handshake (exchanging a temporary code for an access token) to keep client secrets secure. It does not log, save, or store your tokens.

## 4. Third-Party Services

*   **GitHub:** We use the GitHub API to authenticate you and push your code. Their privacy policy applies to data handled by GitHub.
*   **Google Gemini API (Optional):** If you opt-in to use the AI features (smart commit messages, code comments), we send your solution code and problem metadata directly to the Google Gemini API using your provided API key.

## 5. Your Choices

You have full control over your data:
*   You can disconnect your GitHub account at any time via the extension settings. This will delete the token from your browser.
*   You can toggle off auto-pushing or AI features at any time.

## 6. Contact Us

If you have any questions or concerns about this Privacy Policy, please open an issue on our [GitHub repository](https://github.com/GitGrindHQ/gitgrind/issues).
