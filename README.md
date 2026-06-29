<div align="center">
  <img src="icons/icon128.png" alt="GitGrind Logo" width="128"/>
  <h1>GitGrind 🚀</h1>
  <p><strong>Supercharge your coding journey by automatically syncing your competitive programming solutions to GitHub.</strong></p>
</div>

<br />

## 🌟 Overview

**GitGrind** is a powerful, AI-assisted Chrome extension designed for developers and competitive programmers. It automatically captures your successful submissions on major coding platforms and pushes them directly to your designated GitHub repository. 

Stop manually copying and pasting your code. Build your GitHub graph and maintain a beautiful repository of your problem-solving journey effortlessly!

---

## ⚡ Features

* 🔄 **Auto-Sync to GitHub:** Automatically pushes your accepted solutions without leaving the page.
* 🌐 **Multi-Platform Support:** Works seamlessly across:
  * [LeetCode](https://leetcode.com/)
  * [GeeksForGeeks](https://www.geeksforgeeks.org/)
  * [HackerRank](https://www.hackerrank.com/)
* 🧠 **AI-Powered Commits:** Uses AI (via Groq/Gemini API) to automatically generate descriptive, insightful commit messages based on your code and the problem context.
* 📂 **Organized Structure:** Keeps your repository clean and structured (`problems/difficulty/problem-number-name`).
* 📝 **Detailed READMEs:** Automatically generates a `README.md` for each problem containing the original problem statement and a link to the challenge.
* 📊 **Analytics Dashboard:** Track your daily streaks, total problems solved, and breakdown by difficulty (Easy, Medium, Hard) right from the extension popup.
* 🔥 **"Roast My Code":** Get instant AI feedback, optimizations, and a fun "roast" of your submitted solution.

---

## 🛠️ Installation & Setup

1. **Clone or Download** this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** using the toggle in the top right corner.
4. Click **Load unpacked** and select the `gitgrind` folder you downloaded.
5. **Pin the extension** to your browser toolbar for easy access.
6. Click the extension icon to open the **Onboarding screen**, connect your GitHub account, and select the repository where you want your solutions saved!

---

## ⚙️ Configuration

You can customize GitGrind's behavior at any time by right-clicking the extension icon and selecting **Options**:

* **GitHub Repository:** Change the target repository for your pushes.
* **AI API Key:** Input your Groq/Gemini API key to enable AI-generated commit messages and the code roast feature.
* **Repository Structure:** Customize how your folders are organized. *(Note: Currently uses a clean default structure, with more custom formats coming soon!)*
* **Manual Push:** If auto-push misses a submission, you can manually trigger a push directly from the popup while on the problem page.

---

## 🔒 Privacy & Security

* **Your Code is Yours:** GitGrind only pushes your code to the GitHub repository you authorize.
* **OAuth Authentication:** Secure login via GitHub OAuth. We do not store your passwords.
* **API Keys:** Your Groq/Gemini API keys are stored securely and locally in your browser's extension storage.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check out the codebase and submit a Pull Request if you have ideas on how to make GitGrind even better.

---
<div align="center">
  <i>Happy Grinding! 💻✨</i>
</div>
