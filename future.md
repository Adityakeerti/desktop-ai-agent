# Future Features & Revisions

This document outlines proposed and planned enhancements for the R.A.G.E. Windows Automation Agent.

## 1. Core OS Automation & Safety Features

### PowerShell Auto-Tooling Generator (Safe Fallback)
- **Description**: Instead of failing or logging to `missing_tools.json` when a specific API action is missing, allow the LLM to generate and execute localized PowerShell/CLI scripts.
- **Safety**: Display a prompt/modal in the React UI: `[Approve / Edit / Decline]` to keep commands secure and prevent execution of dangerous scripts.
- **Notes**: Add safeguards or handle confirmation prompts (`-Confirm:$false`) and timeout limits to prevent commands from hanging the agent.
- **Relevant Files**: [windows_agent.py](file:///E:/CODING/windows_automation_agent/backend/windows_agent.py), [safety.py](file:///E:/CODING/windows_automation_agent/backend/safety.py), [MainApp.tsx](file:///E:/CODING/windows_automation_agent/frontend/src/components/MainApp.tsx)

### Rule-Based Trigger Automations
- **Description**: Enable simple event-based trigger settings (e.g., *"If battery < 20%, set brightness to 30%"*, *"If Wi-Fi drops, run reconnect command"*, *"Every weekday at 9:00 AM, run morning macro"*).
- **Implementation**: A background observer thread in [hooks.py](file:///E:/CODING/windows_automation_agent/backend/hooks.py) to evaluate trigger conditions.

### Extended Hardware Controls
- **Description**: Direct support for hardware-level adjustments:
  - `set_brightness` (using screen brightness WMI APIs).
  - `toggle_mute` / `toggle_mic` (using pycaw).
  - `lock_screen` / `sleep_pc` / `restart_pc` (using win32/shell).

---

## 2. Frontend UI / UX Upgrades

### Visual Macro Builder & Editor
- **Description**: A dedicated tab/section inside the settings panel to visually manage saved macros.
- **Features**: Drag-and-drop step reordering, adding artificial delays (e.g. `sleep 2 seconds`), and editing arguments inline.
- **Relevant Files**: [MainApp.tsx](file:///E:/CODING/windows_automation_agent/frontend/src/components/MainApp.tsx), [memory.py](file:///E:/CODING/windows_automation_agent/backend/memory.py)

### Interactive Multi-Step Execution Checklist
- **Description**: Visual workflow checklist side-panel showing progress when running `MULTI_STEP` commands.
- **Features**: Show ticks/progress spinners for active steps and support pausing, skipping, or canceling individual steps mid-run.

---

## 3. Core System & Monitoring

### Visual Process Monitor & Performance HUD
- **Description**: Real-time performance widgets integrated into the Globe Canvas or a settings tab.
- **Features**:
  - Live CPU, RAM, Disk, and Network utilization graphs.
  - Interactive process list (a lightweight Task Manager) to kill unresponsive applications.
- **Implementation**: Poll data from backend via `psutil` or `wmi` and stream to frontend.

---

## 4. Smart Windows Integration

### Toast Notification Center
- **Description**: Decodes notifications from `wpndatabase.db` into a unified cyberpunk feed.
- **Features**: Propose quick action shortcuts based on notifications (e.g. reply to emails, check status updates) via LLM context.

### Voice Wake-Word Engine
- **Description**: Support continuous offline wake-word listener (e.g. *"Hey Rage"* or *"Jarvis"*).
- **Features**: Flashes the Globe Canvas when listening and transcribes voice commands in real-time.
