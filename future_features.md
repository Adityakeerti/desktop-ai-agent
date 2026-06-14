# J.A.R.V.I.S. Agent Roadmap: Non-Visual Features

This document outlines the features from the J.A.R.V.I.S. Agent Roadmap that can be fully implemented **without** integrating screen vision (spatial coordinates, image recognition) or OCR (Optical Character Recognition, e.g., Tesseract). Instead, these features rely entirely on Windows OS APIs, browser DOM parsing, standard network APIs, local databases, and audio/text pipelines.

---

## 1. Conversation & Interaction

These features enhance natural dialog, context retention, and multi-step pipeline handling entirely through LLM orchestrations and UI/UX state management.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Follow-up commands**<br>*"now close it"*, *"do that again"*, *"undo that"* | **P1** | Maintain a state ledger of recent actions (e.g., process IDs, window handles, file system modifications) in SQLite. Implement reciprocal actions (e.g., `kill` for `launch`, deleting a created file) or replay queues. |
| **Clarification requests**<br>*Agent asks before acting on ambiguous commands* | **P1** | Utilize LLM intent classification confidence scores. If confidence falls below a set threshold, prompt the user with interactive options in the React UI before execution. |
| **Conversation context**<br>*Remember what was discussed in current session* | **P1** | Feed active session transcripts and local memory records from `mem0-mcp` into the LLM system prompt context window. |
| **Natural corrections**<br>*"no I meant Chrome not Chromium"* | **P2** | Supply the previous step's intent and context alongside the user's correction to the LLM to modify and rerun the command queue. |

---

## 2. Screen & App Control (via OS APIs)

These features manipulate and inspect applications using native Windows OS handles, process management, and windowing libraries, completely bypassing screen capture.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **App state detection**<br>*Knows if app is already open before opening* | **P1** | Enumerate active running processes via Python's `psutil` or search window titles and handles using `win32gui.EnumWindows` to verify if the process/window exists. |
| **Window tiling**<br>*"put Chrome on left, Notepad on right"* | **P2** | Retrieve target window handles by process name or title using `win32gui`, and position them using `SetWindowPos` or `MoveWindow` APIs relative to monitor resolution coordinates. |
| **Tab management**<br>*"open new tab"*, *"close all Chrome tabs"* | **P2** | Send virtual keystrokes (e.g., `Ctrl+T`, `Ctrl+W`) directly to the target window handle using `win32api`/`pyautogui`, or manage tabs programmatically via Chrome DevTools Protocol (CDP) / WebDriver if automated browser sessions are active. |
| **Multi-monitor support**<br>*"move window to second screen"* | **P3** | Query system monitor layouts via `win32api.EnumDisplayMonitors` to retrieve coordinate bounds, then call `SetWindowPos` to translate the target window coordinates to the secondary monitor space. |

---

## 3. File & Folder Management

All file manipulations are executed directly via Python standard libraries and native shell functions, making them highly reliable and completely independent of screen visuals.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Smart file search**<br>*"find all PDFs downloaded this week"* | **P2** | Search file directories using `os.walk` or `pathlib.Path.glob`, filtering items by extension (`.pdf`) and creation/modification time metadata (`mtime`). |
| **Recent files**<br>*"open the last Word doc I worked on"* | **P2** | Inspect the standard Windows Recent items directory (`%APPDATA%\Microsoft\Windows\Recent`) or query MS Office registry keys to find recently modified document shortcuts. |
| **Auto-organizer**<br>*Move files by type/date automatically* | **P3** | Schedule background routine scripts in Python that check directory contents and move files into designated folders based on MIME type or creation date. |
| **Bulk rename**<br>*"rename all these files to include today's date"* | **P3** | Standard Python script iterating over selected files in a target directory and applying regex modifications to rename them using `os.rename`. |
| **Compress/extract**<br>*"zip this folder and send it"* | **P2** | Use Python's built-in `zipfile` or `shutil` libraries to programmatically compress and extract archive files. |
| **Duplicate finder**<br>*Scan and report duplicate files* | **P4** | Traverse targeted directories, calculate cryptographic hashes (e.g., MD5 or SHA256) of files with matching sizes, and list duplicates in a report. |
| **Trash management**<br>*"empty recycle bin"*, *"restore last deleted"* | **P3** | Utilize the `winshell` library or execute shell namespace commands via `win32com.client` to programmatically empty the Recycle Bin or fetch deleted items. |

---

## 4. Browser Automation (via DOM & Headless Ports)

Browser-based actions can be executed by programmatically interacting with the Document Object Model (DOM), browser extensions, or debugging ports, rendering visual locators unnecessary.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Web scraping on command**<br>*"get the price of this product"* | **P2** | Use `Playwright`, `Selenium`, or HTTP requests with `BeautifulSoup` to parse page HTML and query specific CSS selectors or XPath expressions. |
| **Download manager**<br>*"download all images on this page"* | **P3** | Scan the DOM for `<img>` tags, retrieve their source URLs, and download the media files asynchronously using `httpx` or `urllib`. |
| **Login automation**<br>*Fill saved credentials (encrypted local store)* | **P3** | Store credentials in an encrypted SQLite database locally, then inject values directly into matched input fields using DOM selectors via a browser extension or Playwright. |
| **Form submission**<br>*Fill and submit web forms* | **P3** | Populate target form inputs using CSS selector mapping, and call `.submit()` or click the submit element programmatically. |
| **History search**<br>*"open the site I visited yesterday about Python"* | **P3** | Read Chrome/Edge profile directories to parse the SQLite `History` database, executing SQL queries to filter matching records by timestamp and URL/Title. |
| **Bookmark manager**<br>*"bookmark this"*, *"open work bookmarks"* | **P4** | Programmatically read and edit the JSON-formatted browser `Bookmarks` file in the user profile directory. |
| **Read page aloud**<br>*Extract page text and TTS* | **P4** | Scrape web page text content (using Readability algorithms to isolate main text) and pass the text strings directly into a text-to-speech engine like `edge-tts`. |

---

## 5. Communication (Web & App APIs)

Communication features interface with online services, local clients, or system hooks via APIs, totally avoiding screen-level mouse clicks.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Email compose & send**<br>*"email John the report I just made"* | **P3** | Send emails using standard SMTP, Outlook integration via `win32com.client` (interacting with the local Outlook desktop client), or REST APIs (Gmail/Microsoft Graph). |
| **Email summarizer**<br>*"summarize my unread emails"* | **P3** | Fetch messages via IMAP or official APIs, extract plain text bodies, and generate summaries using the local or cloud LLM. |
| **Reply drafting**<br>*"draft a reply declining this meeting"* | **P3** | Generate contextual email drafts in the backend LLM based on incoming mail text, and stage them as drafts via API or local client integration. |
| **Meeting scheduler**<br>*"book a meeting with X tomorrow at 3pm"* | **P4** | Interact directly with Microsoft Outlook Calendar APIs or Google Calendar APIs to create and schedule meetings. |
| **Notification reader**<br>*Read out pending Windows notifications* | **P3** | Use UWP/WinRT APIs (`Windows.UI.Notifications.Management.UserNotificationListener`) in Python to inspect and extract active desktop toast notifications. |

---

## 6. Productivity Tools

Productivity enhancements are run as background tasks, local database records, or standard API queries.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Note taking**<br>*"note this down: ..."* | **P1** | Direct file I/O writing raw or structured text to a dedicated local Markdown/text file (e.g., `notes.md`). |
| **Daily briefing**<br>*"what's on my schedule?" reads calendar + weather* | **P2** | Combine calendar event records (via Outlook/Google APIs) with public weather data (via REST APIs like Open-Meteo) and summarize with the LLM. |
| **Clipboard manager**<br>*History of last 20 copied items, searchable* | **P2** | A background listener that monitors system clipboard updates using `pyperclip` or Win32 APIs, saving copied text entries to a local SQLite database. |
| **Todo list**<br>*"add finish report to my tasks"* | **P2** | Maintain tasks in a local JSON file or SQLite database, exposed via React components in the UI. |
| **Pomodoro timer**<br>*"start a 25 min focus session"* | **P2** | Run an asynchronous countdown timer on the backend, updating the frontend HUD and triggering a system chime/toast when complete. |
| **Calendar integration**<br>*Create, read, reschedule events* | **P3** | Standard calendar scheduling integration using Outlook/Google Workspace APIs. |

---

## 7. System Control (via OS APIs & Shell)

System operations are carried out natively through Windows Shell execution, registry keys, and WMI/pywin32 interfaces.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Battery status**<br>*"how much battery do I have?"* | **P1** | Retrieve current battery metrics (percentage, plug state) using `psutil.sensors_battery()`. |
| **Process manager**<br>*"kill Chrome"*, *"what's eating my RAM?"* | **P2** | Query process tables using `psutil` to identify system memory usage, and call `process.kill()` or `taskkill` by PID. |
| **Power commands**<br>*"sleep in 10 minutes"*, *"restart after updates"* | **P2** | Execute standard power CLI commands (`shutdown /s`, `shutdown /r`, or `SetSuspendState`) via python `subprocess` with deferred scheduling. |
| **WiFi management**<br>*"connect to HomeNetwork"* | **P2** | Connect to saved network profiles using the command-line utility: `netsh wlan connect name="HomeNetwork"`. |
| **Brightness control**<br>*"dim the screen"* | **P2** | Adjust monitor backlight percentages using Windows Management Instrumentation (WMI) brightness control interfaces. |
| **Startup manager**<br>*"disable Spotify from startup"* | **P3** | Manage applications in startup locations by editing Registry values under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` or removing shortcuts in the Startup folder. |
| **Bluetooth**<br>*"connect my headphones"* | **P3** | Retrieve and manage paired Bluetooth devices using Windows Bluetooth APIs or standard Powershell command-line utilities. |

---

## 8. Developer Features

Developer integrations communicate directly with developer CLI binaries and file system pathways.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Run code snippets**<br>*"run this Python script"* | **P2** | Create temporary files containing code snippets and execute them locally using the Python interpreter in a subprocess. |
| **Local server management**<br>*"start my React dev server"* | **P2** | Start long-running background developer processes (e.g. `npm run dev`) and monitor their active stdout streams. |
| **Git commands**<br>*"commit all changes with message fix"* | **P3** | Programmatically run shell-based Git commands (e.g., `git add .`, `git commit -m "msg"`) using the local `git` installation. |
| **Log reader**<br>*"show me the last 50 lines of error.log"* | **P2** | Read local log files via Python file I/O, outputting the tail-end lines to the user console. |
| **API tester**<br>*"make a GET request to localhost:8080/health"* | **P3** | Execute HTTP requests programmatically using `httpx` or `requests` and display response payloads. |
| **Docker control**<br>*"start my postgres container"* | **P3** | Automate docker actions using standard `docker start` CLI commands inside subprocesses. |

---

## 9. AI-Powered Features (Text & Audio)

These AI-driven features operate entirely on document structures, text files, and audio/voice input/output streams.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Document Q&A**<br>*"ask questions about this PDF"* | **P2** | Read text from PDF files using `pdfplumber` or `pypdf`, chunk the text, index it in a vector store, and perform RAG queries via the LLM. |
| **Code explainer**<br>*"explain this code on screen"* | **P2** | Programmatically fetch the active VS Code workspace folder or read the content of files/clipboard directly, then feed the raw text to the LLM. |
| **Text rewriter**<br>*"rewrite this email to sound more professional"* | **P2** | Pass the input text block directly to the LLM system prompt requesting stylistic rewrites. |
| **Translation**<br>*"translate this page to Hindi"* | **P3** | Parse HTML content or raw text from a webpage and process it using translation APIs or LLM prompts. |
| **Meeting notes**<br>*Listen to a call, generate notes* | **P4** | Record system loopback audio / microphone streams using `pyaudio`, transcribe with a speech-to-text pipeline (e.g., `faster-whisper`), and summarize with the LLM. |

---

## 10. Voice & Personality

Voice interactions rely on direct microphone input streams, audio processing packages, and speech synthesis libraries.

| Feature | Priority | Implementation Approach (Non-Visual) |
| :--- | :---: | :--- |
| **Wake word**<br>*"Hey JARVIS" hands-free activation* | **P3** | Run a lightweight offline wake-word listener (using `pvporcupine` or `vosk` on a background thread) processing active audio input. |
| **Offline STT**<br>*faster-whisper on RTX 4050* | **P3** | Run local `faster-whisper` transcription models utilizing GPU acceleration (CUDA) directly on captured audio buffers. |
| **TTS upgrade**<br>*edge-tts, much better quality than pyttsx3* | **P2** | Retrieve synthesized speech audio files from the `edge-tts` API and play them through system audio output endpoints. |
| **Confidence reporting**<br>*"I'm not sure about this, proceed?"* | **P2** | Retrieve self-reported confidence parameters from structured LLM responses and render warnings in the React frontend. |
| **Custom wake word**<br>*User sets their own trigger phrase* | **P4** | Allow configuration of wake-word models or thresholds in the settings menu, dynamically updating the active listener thread. |
