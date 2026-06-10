"""
Windows Automation Agent — Full-Window GUI  v2.0
────────────────────────────────────────────────
Layout:
  Left sidebar  : Arc reactor + status + quick-action buttons + history list
  Main area     : Chat bubble conversation log
  Bottom bar    : Input field (wide) + mic + send + model badge
  Title bar     : R.A.G.E. header + minimize/maximize/close

Requires:  pip install customtkinter
Fonts:     Orbitron, JetBrains Mono (graceful fallback if missing)
"""

import customtkinter as ctk
import tkinter as tk
import threading
import time
import math
import datetime

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# ── Backend wiring ────────────────────────────────────────────────────────────
import backend.windows_agent as _agent_backend
from backend.windows_agent import ask_llm as _ask_llm_backend, execute, global_memory, speak

def ask_llm(command: str):
    global_memory.add_user(command)
    action = _ask_llm_backend(command, global_memory.get_history())
    if action:
        global_memory.add_agent(str(action))
    return (action, "Agent") if action else (None, "Failed")

# ── Colour palette ────────────────────────────────────────────────────────────
BG_DEEP      = "#050B14"
BG_PANEL     = "#0A1424"
BG_SIDEBAR   = "#071020"
BG_INPUT     = "#0D1A2D"
BG_BUBBLE_U  = "#0F2744"     # user bubble
BG_BUBBLE_A  = "#071830"     # agent bubble
CYAN         = "#00F0FF"
CYAN_DIM     = "#008B99"
CYAN_DARK    = "#003D45"
GREEN        = "#00FF9C"
GREEN_DARK   = "#003D28"
RED          = "#FF2A4D"
RED_DARK     = "#3D0015"
AMBER        = "#FFB300"
BORDER       = "#1A3254"
BORDER2      = "#0D2040"
TEXT_DIM     = "#3A5A75"
TEXT_MID     = "#7BAAC8"
TEXT_BRIGHT  = "#DDF2FF"
TEXT_WHITE   = "#FFFFFF"
PURPLE       = "#A855F7"

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("dark-blue")


# ── Arc Reactor canvas ────────────────────────────────────────────────────────
class ArcReactorCanvas(tk.Canvas):
    """Spinning JARVIS-style arc reactor, all coords cast to int."""

    def __init__(self, master, size=140, **kwargs):
        self._sz = size
        self._cx = size // 2
        self._cy = size // 2
        super().__init__(master, width=size, height=size,
                         bg=BG_SIDEBAR, highlightthickness=0, **kwargs)
        self._t      = 0
        self._active = False
        self._color  = CYAN
        self._draw_frame()

    def start(self):
        if self._active:
            return
        self._active = True
        self._color  = CYAN
        self._animate()

    def stop(self, color=CYAN):
        self._active = False
        self._color  = color
        self._t      = 0
        self._draw_frame()

    def set_color(self, color):
        self._color = color
        self._draw_frame()

    def _animate(self):
        if not self._active:
            return
        self._t += 4
        self._draw_frame()
        self.after(30, self._animate)

    def _draw_frame(self):
        self.delete("all")
        cx, cy   = self._cx, self._cy
        r_outer  = int(self._sz * 0.43)
        r_mid    = int(self._sz * 0.36)
        r_inner  = int(self._sz * 0.28)
        r_core   = int(self._sz * 0.13)

        # Outer glow ring
        self.create_oval(
            cx - r_outer - 2, cy - r_outer - 2,
            cx + r_outer + 2, cy + r_outer + 2,
            outline=self._color,
            width=3,
        )

        # Tick marks
        for i in range(12):
            angle  = math.radians(i * 30 + self._t * 0.5)
            tick_r = r_outer - 4
            x1 = int(cx + tick_r * math.cos(angle))
            y1 = int(cy + tick_r * math.sin(angle))
            x2 = int(cx + (tick_r - 7) * math.cos(angle + 0.18))
            y2 = int(cy + (tick_r - 7) * math.sin(angle + 0.18))
            self.create_line(x1, y1, x2, y2, fill=self._color, width=2)

        # Outer spinning arcs
        self.create_arc(cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer,
                        start=self._t, extent=110,
                        outline=self._color, width=3, style="arc")
        self.create_arc(cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer,
                        start=self._t + 180, extent=110,
                        outline=self._color, width=3, style="arc")

        # Middle counter-spinning arc
        self.create_arc(cx - r_mid, cy - r_mid, cx + r_mid, cy + r_mid,
                        start=int(-self._t * 1.3), extent=220,
                        outline=self._color, width=1, style="arc")

        # Inner ring
        self.create_oval(cx - r_inner, cy - r_inner, cx + r_inner, cy + r_inner,
                         outline=self._color, width=1)

        # Core pulse
        core_r = r_core
        if self._active:
            core_r += int(4 * math.sin(self._t * 0.12))
        self.create_oval(
            int(cx - core_r), int(cy - core_r),
            int(cx + core_r), int(cy + core_r),
            fill=self._color, outline="",
        )
        # Core inner dot
        dot_r = max(3, core_r // 3)
        self.create_oval(
            int(cx - dot_r), int(cy - dot_r),
            int(cx + dot_r), int(cy + dot_r),
            fill=BG_DEEP, outline="",
        )


# ── Main Application ──────────────────────────────────────────────────────────
class AgentApp(ctk.CTk):


    QUICK_ACTIONS = [
        ("📸 Screenshot",   "take a screenshot and save it to my desktop"),
        ("💻 Sys Info",     "get system info cpu ram and disk"),
        ("📋 Clipboard",    "get clipboard contents"),
        ("🌐 Search",       "open https://www.google.com"),
        ("📂 Explorer",     "open explorer"),
        ("🗑️ Clear Chat",   "__clear__"),
        ("🔊 Volume 70%",   "set volume to 70"),
        ("📝 Notepad",      "open notepad"),
    ]

    def __init__(self):
        super().__init__()
        self.title("R.A.G.E. (Rarely Appreciated Genius Entity)")
        self.geometry("1100x720+100+60")
        self.minsize(800, 560)
        self.resizable(True, True)
        self.configure(fg_color=BG_DEEP)
        self.wm_attributes("-alpha", 0.97)

        # State
        self._status_state  = "ONLINE"
        self._history       = []        # list of (role, text, action_dict|None)
        self._active_model  = "Ollama / GitHub"

        self._build_ui()
        self._log_agent("R.A.G.E. uplink established. All systems nominal.", tag="info")
        self._log_agent("Type a command or click a quick action on the left.", tag="info")

    # ── Layout ────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # ── Custom title bar ─────────────────────────────────────────────────
        self._build_titlebar()

        # ── Body: sidebar + main ──────────────────────────────────────────────
        body = ctk.CTkFrame(self, fg_color=BG_DEEP, corner_radius=0)
        body.pack(fill="both", expand=True)
        body.columnconfigure(1, weight=1)
        body.rowconfigure(0, weight=1)

        # Sidebar
        sidebar = ctk.CTkFrame(body, fg_color=BG_SIDEBAR, corner_radius=0, width=220)
        sidebar.grid(row=0, column=0, sticky="nsew")
        sidebar.grid_propagate(False)
        self._build_sidebar(sidebar)

        # Thin separator
        sep = ctk.CTkFrame(body, fg_color=BORDER, corner_radius=0, width=1)
        sep.grid(row=0, column=1, sticky="ns")

        # Main chat area
        main = ctk.CTkFrame(body, fg_color=BG_DEEP, corner_radius=0)
        main.grid(row=0, column=2, sticky="nsew")
        body.columnconfigure(2, weight=1)
        self._build_main(main)

    # ── Title bar ─────────────────────────────────────────────────────────────
    def _build_titlebar(self):
        bar = ctk.CTkFrame(self, fg_color=BG_PANEL, corner_radius=0, height=46)
        bar.pack(fill="x")
        bar.pack_propagate(False)

        # Drag
        bar.bind("<ButtonPress-1>",  self._drag_start)
        bar.bind("<B1-Motion>",      self._drag_move)

        # Logo / title
        title_frame = ctk.CTkFrame(bar, fg_color="transparent")
        title_frame.pack(side="left", padx=14)
        title_frame.bind("<ButtonPress-1>", self._drag_start)
        title_frame.bind("<B1-Motion>",     self._drag_move)

        # Arc reactor mini logo (12-px dot)
        dot = tk.Canvas(title_frame, width=12, height=12,
                        bg=BG_PANEL, highlightthickness=0)
        dot.create_oval(1, 1, 11, 11, fill=CYAN, outline="")
        dot.pack(side="left", padx=(0, 8))

        ctk.CTkLabel(
            title_frame, text="R.A.G.E.",
            font=("Orbitron", 15, "bold"), text_color=CYAN,
        ).pack(side="left")

        ctk.CTkLabel(
            title_frame, text="  Windows Automation Agent  v2.0",
            font=("JetBrains Mono", 11), text_color=TEXT_DIM,
        ).pack(side="left")

        # Window controls (right side)
        ctrl = ctk.CTkFrame(bar, fg_color="transparent")
        ctrl.pack(side="right", padx=8)

        ctk.CTkButton(ctrl, text="✕", width=36, height=28,
                      fg_color="transparent", hover_color=RED_DARK,
                      text_color=TEXT_MID, font=("Segoe UI", 13),
                      command=self.destroy).pack(side="right", padx=2)

        ctk.CTkButton(ctrl, text="□", width=36, height=28,
                      fg_color="transparent", hover_color=BORDER,
                      text_color=TEXT_MID, font=("Segoe UI", 13),
                      command=self._toggle_maximize).pack(side="right", padx=2)

        ctk.CTkButton(ctrl, text="—", width=36, height=28,
                      fg_color="transparent", hover_color=BORDER,
                      text_color=TEXT_MID, font=("Segoe UI", 13),
                      command=self.iconify).pack(side="right", padx=2)

        # Bottom accent line
        ctk.CTkFrame(bar, fg_color=CYAN_DIM, height=1,
                     corner_radius=0).pack(side="bottom", fill="x")

    # ── Sidebar ───────────────────────────────────────────────────────────────
    def _build_sidebar(self, parent):
        parent.columnconfigure(0, weight=1)

        # Arc reactor
        reactor_frame = ctk.CTkFrame(parent, fg_color=BG_SIDEBAR, corner_radius=0, height=170)
        reactor_frame.pack(fill="x", pady=(14, 0))
        reactor_frame.pack_propagate(False)
        self._reactor = ArcReactorCanvas(reactor_frame, size=140)
        self._reactor.pack(expand=True)

        # Status badge
        self._status_label = ctk.CTkLabel(
            parent, text="● ONLINE",
            font=("JetBrains Mono", 11, "bold"), text_color=GREEN,
        )
        self._status_label.pack(pady=(4, 0))

        # Divider
        ctk.CTkFrame(parent, fg_color=BORDER, height=1).pack(fill="x", padx=16, pady=10)

        # Quick actions label
        ctk.CTkLabel(parent, text="QUICK ACTIONS",
                     font=("JetBrains Mono", 9), text_color=TEXT_DIM,
                     ).pack(padx=14, anchor="w")

        # Quick-action buttons
        qa_frame = ctk.CTkScrollableFrame(parent, fg_color=BG_SIDEBAR,
                                           corner_radius=0, height=260)
        qa_frame.pack(fill="x", padx=8, pady=(4, 0))

        for label, cmd in self.QUICK_ACTIONS:
            if cmd == "__clear__":
                btn = ctk.CTkButton(
                    qa_frame, text=label, anchor="w",
                    font=("JetBrains Mono", 11),
                    fg_color="transparent", hover_color=RED_DARK,
                    text_color=TEXT_MID, height=32, corner_radius=6,
                    command=self._clear_chat,
                )
            else:
                btn = ctk.CTkButton(
                    qa_frame, text=label, anchor="w",
                    font=("JetBrains Mono", 11),
                    fg_color="transparent", hover_color=CYAN_DARK,
                    text_color=TEXT_MID, height=32, corner_radius=6,
                    command=lambda c=cmd: self._submit_direct(c),
                )
            btn.pack(fill="x", pady=2)

        ctk.CTkFrame(parent, fg_color=BORDER, height=1).pack(fill="x", padx=16, pady=10)

        # Model selector
        ctk.CTkLabel(parent, text="MODEL CHAIN",
                     font=("JetBrains Mono", 9), text_color=TEXT_DIM,
                     ).pack(padx=14, anchor="w")

        self._model_label = ctk.CTkLabel(
            parent, text="Ollama Local → Cloud → GitHub",
            font=("JetBrains Mono", 9), text_color=CYAN_DIM,
            wraplength=200,
        )
        self._model_label.pack(padx=14, pady=(2, 6), anchor="w")

        # Provider selector dropdown
        ctk.CTkLabel(parent, text="ACTIVE PROVIDER",
                     font=("JetBrains Mono", 9), text_color=TEXT_DIM,
                     ).pack(padx=14, anchor="w")

        provider_names = ["Auto (Fallback)"] + [name for name, _ in _agent_backend.PROVIDERS]
        self._provider_var = ctk.StringVar(value="Auto (Fallback)")

        def _on_provider_change(choice: str):
            _agent_backend.SELECTED_PROVIDER = None if choice == "Auto (Fallback)" else choice
            print(f"  [UI] Provider pinned to: {choice}")

        ctk.CTkOptionMenu(
            parent,
            values=provider_names,
            variable=self._provider_var,
            command=_on_provider_change,
            font=("JetBrains Mono", 10),
            fg_color=BG_SIDEBAR,
            button_color=CYAN_DARK,
            button_hover_color=CYAN_DIM,
            text_color=TEXT_MID,
            dropdown_fg_color=BG_DEEP,
            dropdown_text_color=TEXT_MID,
            dropdown_hover_color=CYAN_DARK,
            anchor="w",
            width=190,
        ).pack(padx=14, pady=(2, 10), anchor="w")

        # Bottom: clear memory + version
        ctk.CTkFrame(parent, fg_color=BORDER, height=1).pack(fill="x", padx=16)
        ctk.CTkButton(
            parent, text="🧹 Clear Memory", height=30,
            fg_color="transparent", hover_color=RED_DARK,
            text_color=TEXT_DIM, font=("JetBrains Mono", 10),
            command=self._clear_memory,
        ).pack(fill="x", padx=8, pady=6)

        ctk.CTkLabel(parent, text="v2.0  |  R.A.G.E.",
                     font=("JetBrains Mono", 8), text_color=TEXT_DIM,
                     ).pack(side="bottom", pady=8)

    # ── Main chat area ────────────────────────────────────────────────────────
    def _build_main(self, parent):
        parent.rowconfigure(0, weight=1)
        parent.rowconfigure(1, weight=0)
        parent.columnconfigure(0, weight=1)

        # Chat display — use a tk.Text for rich tags
        chat_frame = ctk.CTkFrame(parent, fg_color=BG_DEEP, corner_radius=0)
        chat_frame.grid(row=0, column=0, sticky="nsew", padx=0, pady=0)
        chat_frame.rowconfigure(0, weight=1)
        chat_frame.columnconfigure(0, weight=1)

        self._chat = tk.Text(
            chat_frame,
            bg=BG_DEEP, fg=TEXT_MID,
            font=("JetBrains Mono", 12),
            relief="flat", bd=0,
            padx=20, pady=14,
            wrap="word",
            cursor="arrow",
            state="disabled",
            spacing1=4,
            spacing3=4,
        )
        self._chat.grid(row=0, column=0, sticky="nsew")

        vsb = ctk.CTkScrollbar(chat_frame, command=self._chat.yview)
        vsb.grid(row=0, column=1, sticky="ns")
        self._chat.configure(yscrollcommand=vsb.set)

        # Tag styles
        self._chat.tag_configure("ts",         foreground=TEXT_DIM,   font=("JetBrains Mono", 9))
        self._chat.tag_configure("user_hdr",   foreground=CYAN,       font=("JetBrains Mono", 11, "bold"))
        self._chat.tag_configure("user_body",  foreground=TEXT_BRIGHT,font=("JetBrains Mono", 12))
        self._chat.tag_configure("agent_hdr",  foreground=GREEN,      font=("JetBrains Mono", 11, "bold"))
        self._chat.tag_configure("agent_body", foreground=TEXT_MID,   font=("JetBrains Mono", 12))
        self._chat.tag_configure("action_tag", foreground=PURPLE,     font=("JetBrains Mono", 11))
        self._chat.tag_configure("result_tag", foreground=GREEN,      font=("JetBrains Mono", 11))
        self._chat.tag_configure("err_tag",    foreground=RED,        font=("JetBrains Mono", 11))
        self._chat.tag_configure("info",       foreground=TEXT_DIM,   font=("JetBrains Mono", 11, "italic"))
        self._chat.tag_configure("sep",        foreground=BORDER,     font=("JetBrains Mono", 9))

        # ── Input bar ────────────────────────────────────────────────────────
        input_area = ctk.CTkFrame(parent, fg_color=BG_INPUT,
                                  corner_radius=0, height=68)
        input_area.grid(row=1, column=0, sticky="ew")
        input_area.pack_propagate(False)
        input_area.columnconfigure(0, weight=1)

        # Top separator
        ctk.CTkFrame(input_area, fg_color=BORDER, height=1,
                     corner_radius=0).pack(fill="x")

        inner = ctk.CTkFrame(input_area, fg_color="transparent")
        inner.pack(fill="x", padx=12, pady=8)
        inner.columnconfigure(0, weight=1)

        self._entry = ctk.CTkEntry(
            inner,
            height=42,
            placeholder_text="⌨  Enter a command or ask anything...",
            font=("JetBrains Mono", 13),
            fg_color=BG_PANEL,
            border_color=BORDER,
            border_width=1,
            text_color=TEXT_BRIGHT,
            corner_radius=8,
        )
        self._entry.grid(row=0, column=0, sticky="ew", padx=(0, 8))
        self._entry.bind("<Return>", lambda e: self._submit())
        self._entry.bind("<Up>",     self._history_up)
        self._entry.bind("<Down>",   self._history_down)
        self._history_idx = -1

        self._mic_btn = ctk.CTkButton(
            inner, text="🎤", width=42, height=42,
            fg_color=BG_PANEL, hover_color=CYAN_DARK,
            text_color=CYAN, font=("Segoe UI", 18),
            corner_radius=8,
            command=self._toggle_listen,
        )
        self._mic_btn.grid(row=0, column=1, padx=(0, 8))

        self._run_btn = ctk.CTkButton(
            inner, text="EXECUTE ▶", width=110, height=42,
            fg_color=CYAN, hover_color=CYAN_DIM,
            text_color=BG_DEEP, font=("JetBrains Mono", 12, "bold"),
            corner_radius=8,
            command=self._submit,
        )
        self._run_btn.grid(row=0, column=2)

    # ── Drag ─────────────────────────────────────────────────────────────────
    def _drag_start(self, e):
        self._drag_x, self._drag_y = e.x_root, e.y_root

    def _drag_move(self, e):
        dx = e.x_root - self._drag_x
        dy = e.y_root - self._drag_y
        self._drag_x, self._drag_y = e.x_root, e.y_root
        x = self.winfo_x() + dx
        y = self.winfo_y() + dy
        self.geometry(f"+{x}+{y}")

    def _toggle_maximize(self):
        if self.state() == "zoomed":
            self.state("normal")
        else:
            self.state("zoomed")

    # ── History nav ───────────────────────────────────────────────────────────
    def _history_up(self, e):
        cmds = [h[1] for h in self._history if h[0] == "user"]
        if not cmds:
            return
        self._history_idx = min(self._history_idx + 1, len(cmds) - 1)
        self._entry.delete(0, "end")
        self._entry.insert(0, cmds[-(self._history_idx + 1)])

    def _history_down(self, e):
        cmds = [h[1] for h in self._history if h[0] == "user"]
        if self._history_idx <= 0:
            self._history_idx = -1
            self._entry.delete(0, "end")
            return
        self._history_idx -= 1
        self._entry.delete(0, "end")
        self._entry.insert(0, cmds[-(self._history_idx + 1)])

    # ── Chat helpers ──────────────────────────────────────────────────────────
    def _chat_insert(self, text, tag="agent_body"):
        self._chat.configure(state="normal")
        self._chat.insert("end", text, tag)
        self._chat.configure(state="disabled")
        self._chat.see("end")

    def _ts(self) -> str:
        return datetime.datetime.now().strftime("%H:%M:%S")

    def _log_user(self, text: str):
        self._history.append(("user", text, None))
        self._chat.configure(state="normal")
        self._chat.insert("end", f"\n  [{self._ts()}]  ", "ts")
        self._chat.insert("end", "YOU\n", "user_hdr")
        self._chat.insert("end", f"  {text}\n", "user_body")
        self._chat.configure(state="disabled")
        self._chat.see("end")

    def _log_agent(self, text: str, tag="agent_body", action: dict = None):
        self._history.append(("agent", text, action))
        self._chat.configure(state="normal")
        if tag == "info":
            self._chat.insert("end", f"  ◦ {text}\n", "info")
        else:
            self._chat.insert("end", f"\n  [{self._ts()}]  ", "ts")
            self._chat.insert("end", "AGENT\n", "agent_hdr")
            self._chat.insert("end", f"  {text}\n", tag)
        self._chat.configure(state="disabled")
        self._chat.see("end")

    def _log_action(self, action_dict: dict):
        a   = action_dict.get("action", "?")
        val = action_dict.get("value") or action_dict.get("path") or ""
        self._chat.configure(state="normal")
        self._chat.insert("end", f"  ⚡ action: ", "ts")
        self._chat.insert("end", f"{a}", "action_tag")
        if val:
            self._chat.insert("end", f"  →  {val}", "ts")
        self._chat.insert("end", "\n")
        self._chat.configure(state="disabled")
        self._chat.see("end")

    def _log_result(self, result_str: str):
        tag = "err_tag" if result_str.lower().startswith("error") else "result_tag"
        self._chat.configure(state="normal")
        lines = result_str.split("\n")
        for line in lines[:12]:   # show up to 12 lines
            self._chat.insert("end", f"  │ {line}\n", tag)
        if len(lines) > 12:
            self._chat.insert("end", f"  │ … ({len(lines) - 12} more lines)\n", "ts")
        self._chat.configure(state="disabled")
        self._chat.see("end")

    def _clear_chat(self):
        self._chat.configure(state="normal")
        self._chat.delete("1.0", "end")
        self._chat.configure(state="disabled")
        self._log_agent("Chat cleared. Memory intact.", tag="info")

    def _clear_memory(self):
        global_memory.clear()
        self._history.clear()
        self._clear_chat()
        self._log_agent("Memory and chat cleared.", tag="info")

    # ── Status helpers ────────────────────────────────────────────────────────
    def _set_status(self, text: str, color: str):
        self._status_state = text
        icon = {"ONLINE": "●", "PROCESSING": "◎", "LISTENING": "◉",
                "SUCCESS": "✓", "FAILED": "✗"}.get(text, "●")
        self._status_label.configure(text=f"{icon} {text}", text_color=color)

    # ── Voice pipeline ────────────────────────────────────────────────────────
    def _toggle_listen(self):
        self._mic_btn.configure(state="disabled", fg_color=CYAN_DIM)
        self._set_status("LISTENING", AMBER)
        threading.Thread(target=self._listen_worker, daemon=True).start()

    def _listen_worker(self):
        try:
            from backend.windows_agent import listen
            text = listen()
            if text:
                self.after(0, lambda: self._entry.delete(0, "end"))
                self.after(0, lambda: self._entry.insert(0, text))
                self.after(0, self._submit)
        except Exception as e:
            self.after(0, lambda e=e: self._log_agent(f"Voice error: {e}", tag="err_tag"))
        finally:
            self.after(0, lambda: self._mic_btn.configure(state="normal", fg_color=BG_PANEL))
            self.after(0, lambda: self._set_status("ONLINE", CYAN))

    # ── Submit pipeline ───────────────────────────────────────────────────────
    def _submit_direct(self, cmd: str):
        """Inject a command as if the user typed it."""
        self._entry.delete(0, "end")
        self._entry.insert(0, cmd)
        self._submit()

    def _submit(self):
        cmd = self._entry.get().strip()
        if not cmd:
            return
        self._entry.delete(0, "end")
        self._history_idx = -1
        self._run_btn.configure(state="disabled", fg_color=BORDER)
        threading.Thread(target=self._run, args=(cmd,), daemon=True).start()

    def _run(self, command: str):
        self.after(0, lambda: self._log_user(command))
        self.after(0, self._reactor.start)
        self.after(0, lambda: self._set_status("PROCESSING", CYAN))
        self.after(0, lambda: self._log_agent("Connecting to LLM matrix...", tag="info"))

        try:
            result, _ = ask_llm(command)
        except Exception as e:
            result = None

        if result:
            def _ui_got_action():
                self._reactor.stop(color=GREEN)
                self._set_status("SUCCESS", GREEN)
                self._log_action(result)

            self.after(0, _ui_got_action)
            time.sleep(0.12)

            exec_result = execute(result)

            def _ui_done():
                self._log_result(exec_result)
                self._run_btn.configure(state="normal", fg_color=CYAN)
                self.after(3000, lambda: self._reactor.set_color(CYAN))
                self.after(3000, lambda: self._set_status("ONLINE", CYAN))

            self.after(0, _ui_done)

        else:
            def _ui_fail():
                self._reactor.stop(color=RED)
                self._set_status("FAILED", RED)
                self._log_agent("All providers failed or network offline.", tag="err_tag")
                self._run_btn.configure(state="normal", fg_color=CYAN)
                self.after(3000, lambda: self._reactor.set_color(CYAN))
                self.after(3000, lambda: self._set_status("ONLINE", CYAN))

            self.after(0, _ui_fail)

    

if __name__ == "__main__":
    app = AgentApp()
    app.mainloop()
