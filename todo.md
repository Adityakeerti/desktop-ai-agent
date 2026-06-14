# J.A.R.V.I.S. Agent Implementation Plan: Remaining Features

This document outlines the step-by-step implementation plan for all remaining features in the roadmap. The chronological order follows a dependency-driven structure—foundational system/context APIs are implemented first to make subsequent high-level features much easier to build.

---

## Phase 1: Foundational OS API & Window Management Helpers (complete)
*These helpers provide the window handle retrieval and process tracking hooks needed by multi-monitor, tiling, and tab controls.*

### Tasks
- [x] **1.1. Create Foundational Window & Screen Query API (complete)**
  - Add native helper functions in a new file `backend/utils/window_utils.py` using `pywin32` (`win32gui`, `win32process`, `win32con`).
  - Implement functions to:
    - Enumerate all visible windows with titles and retrieve their process names.
    - Check if a specific process name has an active window open (`app_state_detection`).
    - Get monitor layouts, display bounds, and coordinates (`win32api.EnumDisplayMonitors`).
  - *Verification:* Write a script `scripts/test_window_helpers.py` to print all active window titles, resolutions, and monitor counts.
- [x] **1.2. Implement App State Detection Integration (complete)**
  - Update `open_app` inside `backend/windows_agent.py` to call `window_utils.app_state_detection()`.
  - If the app is already open, focus it using `SetForegroundWindow` instead of launching a new duplicate process.
  - *Verification:* Request the agent to "open Chrome" when Chrome is already running; verify it activates the existing window instead of launching a new one.
- [x] **1.3. Implement Window Tiling & Multi-Monitor Positioning (complete)**
  - Add `tile_windows` and `position_window` actions to `_execute_core`.
  - Use `win32gui.SetWindowPos` and `win32gui.MoveWindow` to tile windows (left, right, top, bottom, grid layout) and translate coordinates between primary and secondary monitor bounds.
  - *Verification:* Run action `{"action": "tile_windows", "layout": "left_right", "apps": ["chrome", "notepad"]}` and verify window sizing.
- [x] **1.4. Target-Specific Tab Management (complete)**
  - Implement a programmatic tab management system.
  - Use Chrome DevTools Protocol (CDP) debugging ports or send virtual keystrokes (`Ctrl+T`, `Ctrl+W`) directly to targeted window handles using `win32api.SendMessage` (to avoid needing globally focused windows).
  - *Verification:* Execute `"action": "close_tab"` targeting Chrome, ensuring Chrome does not have to be active/focused foreground.

---

## Phase 2: Conversation Context & Execution Ledger (complete)
*Implements state tracking, SQLite logging, and LLM classification hooks needed for follow-up actions, corrections, and interactive user prompts.*

### Tasks
- [x] **2.1. Implement SQLite Action Execution Ledger (complete)**
  - Create an `execution_ledger` table in `backend/memory.py` to record detailed step-by-step executions (action type, parameters, timestamp, target process/window handle, file path affected).
  - Modify `execute` in `backend/windows_agent.py` to record every successful action into the ledger.
  - *Verification:* Run standard actions and verify SQLite rows populate in `execution_ledger`.
- [x] **2.2. Implement Follow-up Commands & Undo/Replay Actions (complete)**
  - Add `undo_last_action` and `repeat_last_action` actions in `_execute_core`.
  - Retrieve the last execution from the SQLite ledger.
  - Build inverse handlers (e.g. `delete_file` for `create_file`, `kill` for `open_app`, `set_volume` with old volume value) or replay the action dictionary.
  - *Verification:* Command "undo that" after creating a file or volume change; verify the file is deleted or volume is reverted.
- [x] **2.3. Implement Natural Corrections Parser (complete)**
  - Build correction logic in `classify_intent` and `build_prompt`. If the command starts with words like "no I meant", "correction:", or references previous errors, fetch the last executed action from the ledger.
  - Inject the last command, last action, and last outcome into the prompt context so the LLM can reconstruct the correct action dictionary (e.g., changing Chromium to Chrome).
  - *Verification:* Test prompt sequence: (1) "open chromium" -> fails/opens wrong app, (2) "no, I meant Chrome". Verify Chrome launches.
- [x] **2.4. Local SQLite Fact-Memory Engine (Key-Free mem0 Alternative) (complete)**
  - Implement a local key-free fact extraction engine in `backend/memory.py` (or a dedicated `backend/local_memory.py`).
  - Create table `local_memories (id INTEGER PRIMARY KEY AUTOINCREMENT, fact TEXT UNIQUE, updated_at TEXT)`.
  - Build a post-interaction step where the user message is sent to the LLM to extract new facts, resolve contradictions, and prune outdated ones.
  - Implement keyword matching/retrieval to load relevant facts into the LLM system prompt context window (`build_prompt`).
  - *Verification:* Say "my project directory is E:/Coding/J.A.R.V.I.S"; verify the fact is extracted in SQLite, restart the agent, and confirm it remembers the path when requested.
- [x] **2.5. Clarification Requests & Confidence Reporting (complete)**
  - Update `classify_intent` to return an explicit `"CONFIDENCE"` score or return `"intent": "AMBIGUOUS"`.
  - If confidence is low, instead of failing or executing, prompt the user with interactive multiple-choice options in the React UI (`MainApp.tsx`) to clarify.
  - *Verification:* Input "delete document". Verify UI presents choice of files to delete.

---

## Phase 3: System Utilities & Local Control Features (complete)
*Adds independent system controls for battery, CPU/RAM management, power management, brightness, network profiles, and startup managers.*

### Tasks
- [x] **3.1. Battery & System Resource Monitor (complete)**
  - Implement actions `get_battery_status` and `get_resource_hogs` in `_execute_core`.
  - Use `psutil.sensors_battery()` for battery levels and plug state.
  - Use `psutil.process_iter()` to query RAM/CPU usage and return the top 5 heaviest processes.
  - *Verification:* Test commands "how much battery do I have?" and "what's eating my RAM?".
- [x] **3.2. Power Management & Deferred Power Commands (complete)**
  - Implement action `power_command` in `_execute_core`.
  - Execute subprocess shell commands (`shutdown /s`, `shutdown /r`, `rundll32.exe powrprof.dll,SetSuspendState`) with optional scheduled timers.
  - *Verification:* Test command "sleep in 5 seconds" and verify suspend triggers.
- [x] **3.3. Advanced WiFi Profile Connection & Bluetooth Manager (complete)**
  - Add actions `connect_wifi` and `manage_bluetooth` to `_execute_core`.
  - Use `netsh wlan connect name="HomeNetwork"` to connect to saved network profiles.
  - Execute PowerShell Bluetooth command wrappers to discover and connect to paired devices (e.g. bluetooth headphones).
  - *Verification:* Request connection to a saved network SSID or BT headphones.
- [x] **3.4. Brightness Monitor & Control (complete)**
  - Add action `set_brightness` to `_execute_core`.
  - Adjust screen backlights programmatically using the Windows WMI brightness control interface.
  - *Verification:* Run `{"action": "set_brightness", "value": 40}` and check monitor.
- [x] **3.5. Registry Startup Manager (complete)**
  - Add action `startup_manager` to enable/disable applications from launching at Windows boot.
  - Modify Registry values under `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
  - *Verification:* Disabling Spotify from startup and verifying registry keys.

---

## Phase 4: Productivity Utilities & Local Databases (complete)
*Builds the clipboard manager daemon, local Markdown note-taking engines, and SQLite todo tables.*

### Tasks
- [x] **4.1. Clipboard History SQLite Daemon (complete)**
  - Implement a background listener thread in `backend/utils/clipboard_daemon.py` that polls for changes in clipboard data.
  - Save copied text, formatted text, or file paths into an SQLite database `clipboard_history`.
  - Expose a `list_clipboard_history` action to fetch/search the last 20 entries.
  - *Verification:* Copy 5 separate items and check if the database lists all 5.
- [x] **4.2. Local Note-Taking Markdown Engine (complete)**
  - Implement action `take_note` to append formatted timestamped notes to a dedicated Markdown file (e.g. `notes.md` in user docs).
  - Parse bullet points and categorize headings based on LLM output.
  - *Verification:* Test "note down that the client meeting is postponed to Tuesday" and verify `notes.md`.
- [x] **4.3. SQLite Todo List Manager (complete)**
  - Add a `todos` table to the local database and build actions: `add_todo`, `list_todos`, `mark_todo_complete`, `delete_todo`.
  - Expose a dedicated Todo component list in the React dashboard UI.
  - *Verification:* Add multiple tasks, view them, and mark them complete via command or UI click.
- [x] **4.4. Pomodoro Focus Session Timer (complete)**
  - Implement action `start_pomodoro` that launches an async countdown timer.
  - Send status updates to the frontend HUD (Vite websocket/event stream) and trigger a native system chime and desktop notification when finished.
  - *Verification:* Start a 1-minute test pomodoro, check countdown updates in UI, and confirm audio alert when complete.

---

## Phase 5: Advanced File Operations & Developer Tools
*Adds smart file search, compression extraction, local script runners, git control, and dev commands.*

### Tasks
- [x] **5.1. Smart File Search, Recent Files & Trash Restoration (complete)**
  - Implement action `smart_file_search` using recursive `os.walk` or glob matching to filter files by extension, metadata dates, and file size.
  - Read recent shortcuts from `%APPDATA%\Microsoft\Windows\Recent` for recent items.
  - Integrate trash bin restoration capabilities.
  - *Verification:* "find all pdfs downloaded this week".
- [x] **5.2. Compress/Extract Archive Utility (complete)**
  - Extend the zip compression utility to support decompression (`unzip_files`).
  - Extract zip/tar archives into a target folder path using Python's `shutil` and `zipfile` modules.
  - *Verification:* Extract `archive.zip` to a test folder and verify files.
- [x] **5.3. Code Snippet Runner & Log Tail Reader (complete)**
  - Implement action `run_code_snippet` to write a block of code (Python, JS, etc.) to a temporary file in a sandbox directory and execute it, returning stdout.
  - Implement a log reader that tails log files (`read_file_tail` reading only the last N lines).
  - *Verification:* Run a python script that prints "hello from sandbox".
- [x] **5.4. Git, Docker, and API HTTP Client Integration (complete)**
  - Implement actions: `git_command`, `docker_command`, and `http_request`.
  - Run git command lines programmatically; run docker starts/stops; execute HTTP requests via `httpx` to test APIs.
  - *Verification:* Run "git status" and "make GET request to localhost:8000/health" via agent.

---

## Phase 6: Browser Automation & Web Parsing (complete)
*Adds Playwright/BeautifulSoup headless web scrapers, local encrypted credential vaults, and DOM-parsing extensions.*

### Tasks
- [x] **6.1. Headless Browser Scraper (Playwright & BeautifulSoup) (complete)**
  - Integrate `playwright` into the backend.
  - Implement actions `scrape_web_page` and `download_page_images`.
  - Navigate sites, wait for dynamic content, extract HTML, and parse specific CSS selectors for prices, headlines, or image tags.
  - *Verification:* Scrape a dummy site and retrieve price tags and raw image download arrays.
- [x] **6.2. Encrypted Local Credentials Vault (complete)**
  - Create a secure database `credentials.db` using cryptography (`cryptography.fernet`) with a password key derived from user machine keys.
  - Build actions to encrypt/store usernames and passwords, and fetch them for automated browser login operations.
  - *Verification:* Store fake credentials, fetch them, decrypt, and confirm they match.
- [x] **6.3. Web Form Autofill & History SQLite Search (complete)**
  - Implement actions `fill_web_form` to inject inputs and click buttons via Playwright DOM selection.
  - Add search actions for local Edge/Chrome history databases (reading profile history files as a locked SQLite DB).
  - *Verification:* Fill out a test local HTML form and execute search for history of a specific site.


---

## Phase 7: Communication, Calendars & Weather Briefing (complete)
*Connects email accounts, schedules calendar appointments, reads desktop notifications, and compiles briefs.*

### Tasks
- [x] **7.1. Email SMTP/IMAP & Outlook COM Bridges (complete)**
  - Add actions: `send_email`, `fetch_emails`, and `draft_email`.
  - Support direct SMTP/IMAP configurations and Outlook client integration using `win32com.client`.
  - Fetch unread email bodies, draft responses locally, and send outgoing mail.
  - *Verification:* Fetch last 3 unread emails and draft a reply to the sender.
- [x] **7.2. Microsoft Graph & Google Calendar Scheduling (complete)**
  - Implement actions: `create_calendar_event`, `list_calendar_events`, and `delete_calendar_event` using client API wrappers or Outlook COM objects.
  - *Verification:* Create an event "Lunch with John tomorrow at 1 PM" and verify it is visible in the calendar.
- [x] **7.3. Desktop Notification Reader Listener (complete)**
  - Implement a Windows Notification Listener utilizing Windows Runtime APIs (`winsdk` / WinRT wrappers) to extract active desktop toasts and print/read them.
  - *Verification:* Send a test notification and ensure the agent logs and reads its contents.
- [x] **7.4. Daily Briefing compiler (complete)**
  - Build a briefing compiler action that runs at startup or on demand.
  - Aggregates the day's weather, calendar events, unread notifications, and urgent emails, feeding them to the LLM to write a morning summary.
  - *Verification:* Call "give me my morning briefing".

---

## Phase 8: Offline Speech, Local RAG & Voice AI
*Enables offline wake-word activation, offline GPU-accelerated STT, higher quality TTS engines, and vector store document Q&A.*

### Tasks
- [ ] **8.1. TTS Upgrade (edge-tts API integration)**
  - Integrate `edge-tts` to replace native `SAPI.SpVoice` / `pyttsx3`.
  - Fetch high-quality natural-sounding audio streams from Microsoft Edge TTS servers and play them back asynchronously.
  - *Verification:* Speak a long sentence and verify improved voice audio.
- [ ] **8.2. Offline STT (faster-whisper) & Wake Word Engine**
  - Implement a background wake word listener thread using `pvporcupine` or `vosk` listening for "Hey J.A.R.V.I.S.".
  - Integrate `faster-whisper` for offline Speech-to-Text utilizing local GPU/CUDA acceleration on audio recording buffers.
  - *Verification:* Speak wake word followed by a command without touching the keyboard.
- [ ] **8.3. Local Vector Store & Document Q&A RAG**
  - Add a lightweight vector database (e.g. `chromadb` or `faiss`) inside the backend.
  - Read text from PDFs, text files, or active VS Code documents using `pdfplumber` or file read.
  - Chunk, generate embeddings locally, store them, and implement actions to query documents.
  - *Verification:* Load a PDF document and ask specific questions about its contents.
- [ ] **8.4. Workspace Code Explainer & Audio Meeting Recorder**
  - Implement a code explainer that reads current VS Code workspaces.
  - Add a meeting recorder using PyAudio loopback audio to record microphone and system speaker feeds, saving them to WAV files, transcribing via whisper, and summarizing.
  - *Verification:* Ask the agent to summarize a recorded audio meeting.

---

## Phase 9: Required Frontend Updates (Based on Completed Backend Features)
*The following UI elements and controls need to be built/integrated in the React frontend (`frontend/src/components/MainApp.tsx` and custom components) to expose the new backend APIs.*

### Tasks
- [x] **9.1. App Control & Window Management Panel (Refining `PanelId: 'apps'`)**
  - Live Window Enumeration list: Add a visual list of currently open windows fetched via backend API, showing window handles (`hWnd`), titles, and process names.
  - Window Tiling controls: Add UI buttons to trigger tiling layouts (`left_right`, `grid`) on selected windows from the list.
  - Tab Manager HUD: Expose visual controls to add/close browser tabs or targets programmatically without needing foreground focus.
- [x] **9.2. Context, History & Memory Panel (Refining `PanelId: 'system'` / Settings)**
  - Visual Execution Ledger: Render a chronological list of recent actions executed by the agent (fetched from SQLite `execution_ledger`), showing parameters, timestamps, and status.
  - Undo/Redo/Replay buttons: Add a quick "Undo Last Action" and "Replay Action" button next to execution ledger entries.
  - Fact-Memory manager: A simple list interface to display facts stored in `local_memories` with delete/edit controls.
- [x] **9.3. System Control Panel (Refining `PanelId: 'system'`)**
  - Battery & Resource Hog lists: Display a real-time battery percentage / plug state widget, and a top-5 CPU/RAM hog process list using `psutil` data.
  - Scheduled Power controls: Add slider/timer inputs to defer power commands (e.g., slider for shutdown/restart delay).
  - WiFi & Bluetooth profiles: Expose a quick network selector list of saved SSIDs and paired Bluetooth devices.
  - Brightness slider: A standard slider interface mapping to WMI backlight brightness levels.
  - Registry Startup list: List apps configured in HKCU startup registry with checkboxes to toggle startup state.
- [x] **9.4. Productivity Utilities Panel (Refining `PanelId: 'todo'` or new tab)**
  - Clipboard History manager: Add a clipboard history pane/tab that renders SQLite `clipboard_history` entries, with options to click-to-copy, search, and delete entries.
  - Note-Taking Markdown viewer: Create a markdown notes viewer/editor to view and manage `notes.md`.
- [x] **9.5. File Matrix Panel (Refining `PanelId: 'file'`)**
  - Smart File Search interface: Expose inputs for extension filters, date range filters, and file size thresholds feeding into the `smart_file_search` API.
  - Recent Files list: Expose a section to quickly view and open recent shortcuts resolved from `%APPDATA%\Microsoft\Windows\Recent`.
  - Recycle Bin viewer & restoration: Display items currently in the Recycle Bin with a visual "Restore" button triggering shell verbs.
  - Compression controls: Add file archive zip/unzip controls to compress selected folders or extract files to target directories.

