# JARVIS User Guide

Welcome to JARVIS! This is your autonomous, multi-modal personal AI assistant. JARVIS is designed to help you with everyday tasks using voice, text, and images.

---

## 🎙️ How to Use the Voice Walkie-Talkie

You can talk to JARVIS hands-free without ever touching your keyboard!
1. Make sure your dashboard is open.
2. Say the wake word: **"JARVIS"** out loud. The microphone icon will light up red.
3. Speak your question or command naturally.
4. **Hands-free sending:** Stop talking for exactly 3 seconds. JARVIS will detect the silence and automatically reply!
5. **Interrupting:** If JARVIS is talking too much, just say **"Stop"**, **"Sleep"**, or **"Shutdown"** to instantly cut him off.

---

## 🌐 Live Google Search

JARVIS is connected directly to the live internet. You don't need to use any special commands!
* Ask him: *"What is the exact temperature in Kochi right now?"*
* Ask him: *"What is the current price of Bitcoin?"*
He will autonomously search Google in the background and give you the latest data.

---

## 🖥️ Controlling Your Computer

You can ask JARVIS to open applications on your local machine.
* **Try saying:** *"JARVIS, can you open the calculator?"*
* **Or type:** *"open notepad"*
*(Note: For security, he can only open whitelisted apps like `calc`, `notepad`, `chrome`, and `cmd`.)*

---

## 🧠 Permanent Memory

JARVIS has a persistent long-term memory database. If you tell him something important, he will remember it forever across all future conversations.
* **Command him:** *"JARVIS, remember that my favorite color is dark blue."*
* **Command him:** *"Memorize this: the Wi-Fi password is 'Hackathon2026'."*

---

## 📚 Reading Your Documents (RAG)

JARVIS can read massive PDFs, text files, or Markdown documents locally without uploading them to the cloud.
1. Click the **Paperclip** icon in the chat bar.
2. Select your document (e.g., a PDF report).
3. Ask him: *"Based on the document I just uploaded, what is the main conclusion?"*

---

## Setup & Running the Server

If you are a developer looking to boot the server locally:
1. Copy `.env.example` to `.env` and insert your `GEMINI_API_KEY`.
2. Run `make setup` to install dependencies.
3. Run `make run-python` to start the AI server.
4. Open your browser to `http://localhost:8000`.
