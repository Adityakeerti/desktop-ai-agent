# R.A.G.E. — Marketing Plan (Learn in Public)

## Strategy

Build an audience by **showing the journey**, not the product. Each post teaches something, shows real code/reality, and invites people to follow along. No GitHub link until launch day — drive followers to a waitlist/landing page instead.

**Tone**: Self-deprecating, hacker-ish, technically honest. No hype. Show failures too.

**Hashtag bank** (rotate 2-3 per post): `#buildinpublic` `#python` `#windows` `#automation` `#aiagents` `#llm` `#sideproject` `#opensource` (only at launch)

**Best times**: Tue-Thu 8-10am / 12-2pm / 6-8pm ET. Weekend mornings for long threads.

---

## Campaign 1 — Project Reveal (Launch Week)

> Goal: Introduce the project, hook the Windows + AI crowd.

### Post 1 — The Hook

> I built an AI agent that controls my Windows PC by voice/text.
>
> "open chrome at youtube.com"
> "set volume to 40"
> "send whatsapp to mom"
>
> It runs a hybrid chain — first tries local Ollama (gemma4, fully offline), falls back to free cloud models. Zero cost, zero API bills.
>
> Here's how it works: [screenshot/GIF of the UI]
>
> Building in public. Follow for updates → [waitlist link]

### Post 2 — Architecture Thread

> The architecture behind my Windows AI agent:
>
> 1/ User types a command → React UI (pywebview) → Python backend
>
> 2/ Backend routes through a 3-tier LLM fallback chain:
>    🥇 Ollama Local (gemma4:e4b) — private, 0 latency
>    🥈 Ollama Cloud (gemma4:31b-cloud) — bigger, free
>    🥉 GitHub Models (gpt-4o-mini) — most capable, free tier
>
> 3/ LLM returns strict JSON → action dispatcher executes on Windows (pyautogui, win32, uiautomation)
>
> 4/ Safety layer blocks dangerous commands. Sandbox mode for dry-runs.
>
> [architecture diagram]
>
> Each tier costs exactly $0. The only dependency is a free GitHub token.

### Post 3 — The Naming Story

> Named my project R.A.G.E. — Rarely Appreciated Genius Entity.
>
> Because that's what building Windows automation feels like. You spend weeks getting edge cases right and nobody notices... until the agent accidentally opens 47 Chrome tabs.
>
> waitlist → [link]

### Post 4 — What it can actually do

> My AI agent can:
> - Open any app / URL
> - Type, click, scroll, drag
> - Read/write files, zip, download
> - Set volume, get system info
> - Send WhatsApp messages
> - Search the web
> - Set reminders
> - Clipboards, screenshots, PowerShell
>
> All from plain English. All via a 3-tier free LLM chain.
>
> waitlist → [link]

---

## Campaign 2 — Learn in Public (Technical Deep Dives)

> Goal: Establish credibility. Show you actually built the hard parts.

### Post 5 — The LLM Prompt That Made It Work

> The secret to getting an LLM to reliably control Windows?
>
> Crystal-clear JSON contracts.
>
> I spent 3 weeks tweaking the prompt until the model stopped hallucinating actions. The magic was:
> - Few-shot examples (20 real command→action pairs)
> - Strict JSON schema validation
> - "If unsure, return {action: 'clarify'}" escape hatch
>
> Prompt snippet: [screenshot]

### Post 6 — Safety First

> Giving an LLM control of your PC is terrifying.
>
> Here's my safety stack:
>
> - Blocklist: regex patterns for dangerous commands (format, del /f, UAC changes)
> - Sandbox mode: executes with zero side effects
> - Emergency stop: Ctrl+Shift+X kills everything
> - Confirmation modals: destructive actions need human OK
>
> Never ship an automation agent without this.

### Post 7 — The UI Was Harder Than The Agent

> People think the AI agent was the hard part. Nope.
>
> The React UI (pywebview + Tailwind) took longer.
>
> Why? Because building a chat interface that:
> - Shows streaming responses
> - Has command history (↑/↓)
> - Supports drag-drop, voice input
> - Stays performant on low-end Windows machines
> - Integrates with Python via API bridge
>
> ...is genuinely hard. Full stack builders, you know the pain.

### Post 8 — Why Free Cloud Models

> Why my agent uses 3 LLM providers but costs me zero:
>
> 1️⃣ Ollama Local — gemma4:e4b, runs offline, no API needed
> 2️⃣ Ollama Cloud — gemma4:31b-cloud, needs a free API key
> 3️⃣ GitHub Models — gpt-4o-mini, free tier (you just need a GitHub account)
>
> If local is fast → it uses local. If local chokes → falls to cloud. Zero-cost at every step. No subscription required.

### Post 9 — Memory & Macros

> Your AI agent should remember what you did.
>
> I built SQLite memory that tracks: every command, frequency, and success rate.
>
> And macros — say "save this as archive_work" and the agent can replay 5 actions on demand.
>
> It's like teaching someone to use your PC by showing them once.

### Post 10 — Hook Into Everything

> Windows hooks are terrifyingly powerful.
>
> My agent watches:
> - 📋 Clipboard (suggests actions for URLs/paths copied)
> - 📥 Downloads folder (auto-organizes files into folders)
> - 🔔 Windows notifications (shows them in the UI panel)
> - 🪟 Boot startup (agent launches with Windows)
>
> All via win32 API. All in Python.

---

## Campaign 3 — Demos (Visual Proof)

> Goal: High engagement. Show the agent working in real scenarios.

### Post 11 — Speed Demo (Video/GIF)

> POV: You tell your PC "zip these 3 files and email them" and it just... does it.
>
> [Screen recording — 15 seconds]
>
> Voice command → agent executes zip + opens Outlook with attachment.
>
> Follow for the launch: [waitlist link]

### Post 12 — Automation Failure (Learn in Public)

> Yesterday I asked my agent to "organize my desktop" and it moved ALL my project folders into a subfolder called "organised".
>
> Spent 30 minutes undoing it.
>
> This is why sandbox mode exists. Always test in sandbox first, kids.
>
> [screenshot of the mess]

### Post 13 — Real Workflow

> My actual daily workflow with the agent:
>
> Morning -> "get weather for Mumbai, open my calendar, set volume 30"
> Works -> "get system info, save to report.txt"
> Evening -> "zip today's logs, send via whatsapp"
>
> It handles all of these. Not perfectly every time. But enough that I miss it when it's off.
>
> [GIF of morning routine]

---

## Campaign 4 — Pre-Launch Hype

> Goal: Build a waitlist and an audience so launch day has momentum. No GitHub link yet.

### Post 14 — Waitlist Drop

> I'm getting close.
>
> The agent can now:
> - Watch your clipboard and suggest actions
> - Auto-organize your Downloads folder
> - Start with Windows (system tray)
>
> One last round of polish and I'll open source it.
>
> Join the waitlist to know the minute it drops → [link]

### Post 15 — What's Missing

> Before I open source this, I want to nail:
> [ ] Plugin system for community actions
> [ ] Better error recovery (when the LLM returns gibberish)
> [ ] macOS backend (long shot)
> [x] Safety sandbox ✅
> [x] Emergency kill switch ✅
> [ ] Documentation that doesn't suck
>
> Which matters most to you?

### Post 16 — Progress Update

> Spent the weekend refactoring the action dispatcher. Cut 200 lines. Added retry logic for failed commands.
>
> The codebase is at ~1800 lines of Python + React + TypeScript.
>
> Every line written by one person. On a laptop. At 2am.
>
> Launching soon. [waitlist link]

### Post 17 — Dogfooding

> I've been using my own agent exclusively for the last 48 hours.
>
> Things that broke:
> - It minimized my browser while I was typing this tweet
> - It opened YouTube music when I said "open YouTube" (meant the homepage)
>
> Things that felt magical:
> - "take a screenshot and save" in one command
> - "set volume to 30, open spotify, play lofi" — all three, in sequence
>
> It's the failures that make it better. Dogfooding is the best QA.

---

## Campaign 5 — Thought Leadership

> Goal: Position yourself as someone who knows Windows automation + LLMs.

### Post 18 — Hot Take

> Hot take: LLM-powered desktop automation is MORE impactful than coding agents.
>
> Copilot writes code. Cool.
>
> My agent opens apps, clicks buttons, sends messages, organizes files, controls volume, watches clipboards. It interacts with the OS, not just the IDE.
>
> That's the future. We're just scratching the surface.

### Post 19 — Lessons Learned

> Things I learned building a Windows AI agent:
>
> 1. pyautogui is fragile. uiautomation is the real deal.
> 2. Async never works cleanly with Windows GUI APIs.
> 3. LLM JSON parsing fails more than you expect.
> 4. A safety sandbox should be your FIRST feature, not an afterthought.
> 5. The UI matters more than the agent. If it looks jank, nobody cares.
>
> Thread on each lesson this week.

### Post 20 — The "Why"

> Why build a local-first AI agent when ChatGPT exists?
>
> 1. Privacy — primary model runs 100% offline
> 2. No subscription — free cloud fallbacks handle the hard cases
> 3. No internet needed for basic commands
> 4. Full control — you own the code, the model, the data
> 5. Customizability — add any action you want
>
> Cloud is convenient. Local + free cloud fallback is best of both worlds.

---

## Campaign 6 — Launch Day

> Goal: Maximum impact when you open source.

### Post 21 — The Launch

> It's live.
>
> R.A.G.E. — an open-source, LLM-powered Windows automation agent.
>
> What it does:
> - 20+ actions (apps, files, system, whatsapp, web search)
> - 3-tier free LLM fallback chain
> - React UI + Tkinter fallback
> - Safety sandbox + emergency kill
> - Memory, macros, clipboard/download/notification hooks
>
> [link to GitHub]
>
> MIT license. No cloud costs. Full control.

### Post 22 — Call for Contributors

> Just dropped v1.0. Looking for:
> - macOS/Linux port contributors
> - More app-specific automations
> - Voice wake word (offline)
> - Plugin system
>
> First PR merged within an hour 👀
>
> [link to GitHub]

---

## Reposting / Engagement Schedule

| Day | Content |
|-----|---------|
| Mon | Demo / GIF (Campaign 3) |
| Tue | Learn in public (Campaign 2) |
| Wed | Pre-launch / progress (Campaign 4) |
| Thu | Thought leadership (Campaign 5) |
| Fri | Casual / behind the scenes |
| Sat | Engagement — reply to comments, RT others |
| Sun | Plan next week / build |

---

## Pre-Launch Funnel

```
X/Twitter post → [waitlist landing page] → email collected
                                   ↓
                          weekly dev logs (email)
                                   ↓
                        launch day announcement
                                   ↓
                          GitHub link goes live
```

## Metrics to Track (Pre-Launch)

- **Waitlist signups** — primary KPI
- **X followers** — who's following (target devs, AI builders, Windows power users)
- **Engagement rate** — likes + replies + reposts / impressions
- **DM conversations** — quality signal, potential early testers

Goal: 200 waitlist signups before launch.

---

## Profile Setup

- **Bio**: Building R.A.G.E. — a free, open-source AI agent for Windows automation. Python + React + LLMs. Launching soon.
- **Pinned tweet**: Post 1 or Post 14 (the hook or the waitlist)
- **Link in bio**: Waitlist landing page (not GitHub)

---

## Waitlist Landing Page Ideas

- Simple form: email + "what would you automate?" (builds your backlog)
- Show the GIF from Post 11 above the form
- "Join 200+ early adopters" (social proof counter)
- Bonus: first 50 get early access before public launch
