# R.A.G.E. — Windows Automation Agent

## Project Overview
React + Vite frontend (TypeScript, Tailwind v4) + Python backend (asyncio, pyautogui, win32). Windows 10/11 only.

## Must-Follow Rules (Only for Discussion Mode)

Discussion Mode is for planning, architecture review, debugging analysis, and design conversations — **no file edits, no commits, no code changes**. The goal is to think things through before switching to Implementation Mode.

### 1. Memory
- Do **not** update, add, or modify memory entries in this mode.
- Use existing memory (mem0-mcp) for context when it's relevant — e.g. recalling past decisions, naming conventions, or why something was built a certain way — but treat it as read-only reference material.
- If memory conflicts with what's currently in the codebase, flag the discrepancy rather than silently picking one.

### 2. Web Search
- Use web search when needed for up-to-date info: library/API changes (Tailwind v4, pywebview, pyautogui, uiautomation, pycaw), Windows-specific quirks (e.g. `WinError 5`, UAC, DPI scaling), or verifying current best practices.
- Prefer official docs/changelogs over blog posts when version-specific behavior matters.
- Cite what changed and since when if a library API has shifted from what the project currently assumes.

### 3. Scope of Discussion
- Stay conversational: explain trade-offs, propose options, sketch pseudocode or diffs inline — don't generate full files or run build/test commands.
- When a proposed change touches a skill area (`tailwind-4-docs`, `async-python-patterns`, `executing-plans`, `systematic-debugging`), it's fine to reference relevant conventions from memory/knowledge without formally loading the skill file — that's an Implementation Mode requirement.

### 4. Debugging & Analysis
- For bug reports or unexpected behavior, reason through root cause first (isolate → hypothesize → verify against code) before suggesting a fix. Don't propose a patch until the cause is reasonably confident.
- Call out any assumptions explicitly (e.g. "assuming the action dispatcher in `windows_agent.py` still routes by string key").

### 5. Decisions & Handoff
- End discussions with a clear, actionable summary: what was decided, what's still open, and what the next Implementation Mode task should be.
- Don't silently start implementing — if the conversation reaches a concrete plan and the user wants it built, confirm the switch to Implementation Mode before touching files.

### 6. Tone & Format
- Match the user's directness — skip preamble, get to the point, avoid restating the question back.
- Use code snippets/pseudocode for clarity, but keep them illustrative, not production-ready deliverables.

## Must-Follow Rules (Only for Implementation Mode)

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

### 4. Memory — Check & Update on Every Task
Always inspect the `mem0-mcp` memory database (search/get memories) BEFORE starting work to gain context on past decisions or requirements, and update/add new memories AFTER completing the task to preserve progress for future agents.

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