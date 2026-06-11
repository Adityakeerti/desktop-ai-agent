# R.A.G.E. — Windows Automation Agent

## Project Overview

React + Vite frontend (TypeScript, Tailwind v4) + Python backend (asyncio, pyautogui, win32). Windows 10/11 only.

## Must-Follow Rules

### 1. Skills — Load Them on Every Matching Task

Your tool description lists available skills under `<skills>`. When ANY of the conditions below are met, you MUST call the `view_file` tool to load that skill's `SKILL.md` (e.g., using `view_file` on the path provided in the skill definition) and follow its instructions. Do NOT skip this step.

| Skill | When to load it (mandatory) |
|-------|----------------------------|
| `executing-plans` | User provides a task list, plan file, or asks you to implement from a written plan. Load BEFORE starting any work. |
| `tailwind-4-docs` | Any frontend work in `frontend/` — styling, components, layout, migration, or review. Load BEFORE editing any `.tsx`/`.css` file. |
| `async-python-patterns` | Any backend work in `backend/` — adding actions, refactoring, debugging async code. Load BEFORE editing any `.py` file. |
| `systematic-debugging` | Any bug report, traceback, or unexpected behavior. Load BEFORE attempting a fix. Do NOT guess — isolate, reproduce, verify. |

### 2. No Auto-Tool Generation

Do NOT hallucinate shell commands for unsupported actions. If an action doesn't exist, log it for future implementation and rely on existing patterns.

### 3. Lint + Typecheck Before Done

Run these AFTER making changes and BEFORE declaring a task complete:

```powershell
# Backend
cd backend; python -m py_compile windows_agent.py; if ($?) { cd .. }

# Frontend
cd frontend; npx tsc --noEmit; if ($?) { npm run build; cd .. }

# Tests
python -m pytest tests/ -x -q
```

## Project Structure

```
backend/
  windows_agent.py    # Core engine: LLM routing, action dispatcher
  agent_ui.py         # CustomTkinter GUI (Arc Reactor)
frontend/
  src/
    components/       # React components (MainApp.tsx, GlobeCanvas.tsx)
    App.tsx           # Root app component
  dist/               # Production build
scripts/
  run_webview.py      # pywebview launcher
```

## Tech Stack

- **Backend**: Python 3.11+, asyncio, pyautogui, pywin32, pycaw, uiautomation
- **Frontend**: React 18, TypeScript, Vite, Tailwind v4
- **LLM Providers**: Ollama (local/cloud), GitHub Models
- **UI**: pywebview (React) + CustomTkinter (fallback)

## Conventions

- Backend: use async/await. Never `time.sleep()`. Handle `WinError 5` gracefully.
- Frontend: Tailwind only. No raw CSS. Dark mode, glassmorphism, micro-animations.
- All LLM responses must be parseable JSON.
- New apps/actions follow the existing pattern in `windows_agent.py` execute().
- Commit messages: concise, single line, describe what changed.
