import webview
import threading
import sys
import os
# Allow running from repo root or from scripts/ directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import json
import time

# Import backend logic
import backend.windows_agent as _agent_backend
from backend.windows_agent import (
    ask_llm as _ask_llm_backend,
    execute as _execute_backend,
    global_memory,
    listen as _listen_backend,
    _check_missing_tool_suggestions,
    classify_intent as _classify_intent,
    run_react_loop as _run_react_loop,
    EXECUTION_LOG_PATH,
    MISSING_TOOLS_PATH,
)

import backend.safety as safety
import backend.memory as memory
import backend.hooks as hooks

try:
    import psutil
    _PSUTIL = True
except ImportError:
    _PSUTIL = False

try:
    import pyperclip
    _PYPERCLIP = True
except ImportError:
    _PYPERCLIP = False


class Api:
    def __init__(self):
        self.file_lock = threading.Lock()

    # ── Settings & Hooks API Bridges ──────────────────────────────────────────

    def get_sandbox_mode(self):
        return safety.is_sandbox_active()

    def set_sandbox_mode(self, enabled):
        safety.set_sandbox_mode(enabled)
        hooks.trigger_ui_refresh()
        return "ok"

    def is_startup_enabled(self):
        return hooks.is_startup_enabled()

    def set_startup_enabled(self, enabled):
        hooks.set_startup_enabled(enabled)
        hooks.trigger_ui_refresh()
        return "ok"

    def get_macros(self):
        return json.dumps(memory.list_macros())

    def delete_macro(self, name):
        memory.delete_macro(name)
        hooks.trigger_ui_refresh()
        return "ok"

    def save_macro(self, name, steps):
        """Saves a macro directly with name and steps list."""
        try:
            memory.save_macro(name, steps)
            hooks.trigger_ui_refresh()
            return "Success"
        except Exception as e:
            return f"Error: {e}"

    def edit_macro_via_prompt(self, name, instruction):
        print(f"[Api] Editing macro '{name}' with prompt: {instruction}")
        from backend.windows_agent import edit_macro_steps_via_llm
        existing_steps = memory.get_macro(name)
        if not existing_steps:
            return f"Error: Macro '{name}' does not exist."
            
        try:
            new_steps = edit_macro_steps_via_llm(name, existing_steps, instruction)
            # Safety guard: only delete if instruction explicitly says so.
            # Prevents LLM returning [] on failure from silently wiping the macro.
            _delete_keywords = ("delete", "clear", "remove all", "wipe", "erase", "reset")
            _explicit_delete = any(kw in instruction.lower() for kw in _delete_keywords)
            if not new_steps:
                if _explicit_delete:
                    memory.delete_macro(name)
                    hooks.trigger_ui_refresh()
                    return f"Macro '{name}' cleared."
                else:
                    return (f"Error: The edit returned no steps for macro '{name}'. "
                            "The macro was NOT deleted. Please try a more specific instruction.")
            else:
                try:
                    memory.save_macro(name, new_steps)
                except Exception as e:
                    return f"Error: Failed to save macro '{name}': {e}"
                hooks.trigger_ui_refresh()
                return "Success"
        except Exception as e:
            return f"Error: {e}"


    # ── Memory DB Inspection ───────────────────────────────────────────────────

    def get_memory_db_stats(self):
        """Return row counts for all memory tables."""
        return json.dumps(memory.get_db_stats())

    def get_memory_history(self):
        """Return all interaction history rows."""
        return json.dumps(memory.get_interaction_history())

    def get_memory_log(self):
        """Return interaction log rows (latest 500)."""
        return json.dumps(memory.get_interaction_log())

    def get_profile(self):
        """Return the user personalization profile as a JSON string."""
        return json.dumps(memory.get_profile())

    def set_profile(self, field: str, value: str):
        """Upsert a single profile field. Returns 'ok' or 'error: ...'"""
        try:
            ok = memory.set_profile_field(field, value)
            if ok:
                hooks.trigger_ui_refresh()
                return "ok"
            return f"error: unknown field '{field}'"
        except Exception as e:
            return f"error: {e}"

    def set_profile_batch(self, profile_json: str):
        """Batch-update profile from a JSON string dict. Returns 'ok'."""
        try:
            profile_dict = json.loads(profile_json)
            memory.set_profile(profile_dict)
            hooks.trigger_ui_refresh()
            return "ok"
        except Exception as e:
            return f"error: {e}"


    # ── Core command pipeline ──────────────────────────────────────────────────
    
    def listen(self):
        """Calls the backend listen function and returns transcribed text."""
        print("[Api] Listening for voice input...")
        try:
            return _listen_backend()
        except Exception as e:
            print(f"[Api] Voice error: {e}")
            raise e


    def ask_llm(self, command: str):
        """
        Takes a string command from React, runs it through the LLM.
        Returns a dict: {"action": "some_action", "result": "raw string", "full": {...}}
        """
        print(f"[Api] Received command: {command}")
        self._last_command = command
        safety.reset_emergency_stop()
        global_memory.add_user(command)

        cmd_lower = command.strip().lower()

        # 1. Intercept macro save command
        import re
        save_match = re.match(r"save\s+(?:last\s+(\d+)\s+)?actions\s+as\s+(.+)", cmd_lower)
        if not save_match:
            save_match = re.match(r"save\s+this\s+as\s+(.+)", cmd_lower)

        if save_match:
            if len(save_match.groups()) == 2:
                num_steps = int(save_match.group(1)) if save_match.group(1) else 3
                macro_name = save_match.group(2).strip()
            else:
                num_steps = 3
                macro_name = save_match.group(1).strip()

            user_cmds = []
            history = global_memory.get_history()
            # Traverse history and skip non-user actions
            for item in reversed(history[:-1]):
                if item.startswith("User:"):
                    cmd_val = item[len("User:"):].strip()
                    if not (cmd_val.lower().startswith("save ") or cmd_val.lower().startswith("run ") or cmd_val.lower().startswith("delete macro")):
                        user_cmds.insert(0, cmd_val)
                        if len(user_cmds) >= num_steps:
                            break

            if user_cmds:
                memory.save_macro(macro_name, user_cmds)
                reply_val = f"Saved macro '{macro_name}' with {len(user_cmds)} steps:\n" + "\n".join(f"  {i+1}. {c}" for i, c in enumerate(user_cmds))
                action_dict = {"action": "reply", "value": reply_val}
                self._last_action = action_dict
                hooks.trigger_ui_refresh()
                return {"action": "reply", "full": action_dict, "result": "Success"}
            else:
                action_dict = {"action": "reply", "value": "Could not find any recent user commands to save as a macro."}
                self._last_action = action_dict
                return {"action": "reply", "full": action_dict, "result": "Success"}

        # 2. Intercept macro run command
        macro_run_name = cmd_lower
        if macro_run_name.startswith("run "):
            macro_run_name = macro_run_name[4:].strip()

        macro_steps = memory.get_macro(macro_run_name)
        if macro_steps:
            action_dict = {
                "action": "run_macro",
                "value": macro_run_name,
                "steps": macro_steps
            }
            self._last_action = action_dict
            return {"action": "run_macro", "full": action_dict, "result": "Success"}

        # ── Intent classification pre-step ──────────────────────────────────
        print(f"[Api] Classifying intent for: {command!r}")
        intent_result = _classify_intent(command, global_memory.get_history())
        intent_label   = intent_result.get("intent", "SINGLE_ACTION")
        intent_reason  = intent_result.get("reason", "")
        intent_hints   = intent_result.get("steps_hint", [])
        print(f"[Api] Intent: {intent_label} — {intent_reason}")

        # ── UNSAFE: block immediately ────────────────────────────────────────
        if intent_label == "UNSAFE":
            block_msg = f"⛔ Command blocked: {intent_reason}"
            action_dict = {"action": "reply", "value": block_msg}
            self._last_action = action_dict
            return {
                "action": "reply",
                "full": action_dict,
                "result": "Blocked",
                "intent": "UNSAFE",
                "intent_reason": intent_reason,
            }

        # ── QUESTION: skip action routing, use conversational reply ──────────
        if intent_label == "QUESTION":
            from backend.windows_agent import conversational_reply as _conv_reply
            reply_text = _conv_reply(command, global_memory.get_history())
            action_dict = {"action": "reply", "value": reply_text}
            global_memory.add_agent(action_dict)
            self._last_action = action_dict
            return {
                "action": "reply",
                "full": action_dict,
                "result": "Success",
                "intent": "QUESTION",
                "intent_reason": intent_reason,
            }

        # ── MULTI_STEP: signal the frontend to call react_loop instead ───────
        if intent_label == "MULTI_STEP":
            action_dict = {
                "action": "multi_step",
                "value": command,
                "steps_hint": intent_hints,
            }
            try:
                memory.record_interaction(command, action_dict)
            except Exception as e:
                print(f"[Api] Error logging multi-step command: {e}")
            self._last_action = action_dict
            self._last_react_goal = command
            self._last_react_hints = intent_hints
            return {
                "action": "multi_step",
                "full": action_dict,
                "result": "ReAct loop required",
                "intent": "MULTI_STEP",
                "intent_reason": intent_reason,
                "steps_hint": intent_hints,
            }

        # ── SINGLE_ACTION: normal LLM routing ───────────────────────────────
        action_dict = _ask_llm_backend(command, global_memory.get_history())

        if action_dict:
            global_memory.add_agent(action_dict)          # pass dict directly — add_agent does json.dumps internally
            self._last_action = action_dict               # cache for execute_action
            return {
                "action": str(action_dict.get("action", "unknown action")),
                "full":   action_dict,
                "result": "Success",
                "intent": "SINGLE_ACTION",
                "intent_reason": intent_reason,
            }

        self._last_action = None
        return None

    def execute_action(self, action_str: str, confirmed: bool = False):
        """
        Executes the last parsed action dict (cached from ask_llm).
        Falls back to parsing history if cache is missing.
        Returns a human-readable result string.
        """
        print(f"[Api] Executing: {action_str} (confirmed={confirmed})")

        action_dict = getattr(self, "_last_action", None)

        if not action_dict:
            history = global_memory.get_history()
            for item in reversed(history):
                if item.startswith("Agent Action: "):
                    content = item[len("Agent Action: "):]
                    try:
                        parsed = json.loads(content)
                        if isinstance(parsed, dict):
                            action_dict = parsed
                        elif isinstance(parsed, str):
                            import ast
                            action_dict = ast.literal_eval(parsed)
                        break
                    except Exception as e:
                        print(f"[Api] Error parsing action dict from history: {e}")

        if action_dict:
            if confirmed:
                action_dict["confirmed"] = True
            # Check if action is run_macro
            if action_dict.get("action") == "run_macro":
                steps = action_dict.get("steps", [])
                name = action_dict.get("value", "") or action_dict.get("name", "")
                if not steps and name:
                    import backend.memory as memory
                    steps = memory.get_macro(name) or []
                
                def run_steps():
                    try:
                        win = webview.windows[0]
                        for i, step in enumerate(steps):
                            if safety.is_emergency_stopped():
                                win.evaluate_js(f"if (window.addMessageFromPython) window.addMessageFromPython('error', 'Macro execution aborted: Emergency Stop active.');")
                                break
                                
                            win.evaluate_js(f"if (window.addMessageFromPython) window.addMessageFromPython('user', {json.dumps(step)});")
                            global_memory.add_user(step)
                            
                            step_action = _ask_llm_backend(step, global_memory.get_history())
                            if step_action:
                                global_memory.add_agent(step_action)
                                win.evaluate_js(f"if (window.addMessageFromPython) window.addMessageFromPython('action', '⚡ ACTION → ' + {json.dumps(step_action.get('action'))});")
                                
                                step_result = _execute_backend(step_action, step)
                                if step_result.lower().startswith('error'):
                                    win.evaluate_js(f"if (window.addMessageFromPython) window.addMessageFromPython('error', {json.dumps(step_result)});")
                                else:
                                    win.evaluate_js(f"if (window.addMessageFromPython) window.addMessageFromPython('result', {json.dumps(step_result)});")
                            else:
                                win.evaluate_js(f"if (window.addMessageFromPython) window.addMessageFromPython('error', 'Step failed: LLM returned no action.');")
                                break
                            time.sleep(1.0)
                    except Exception as e:
                        print(f"Error running macro: {e}")
                
                threading.Thread(target=run_steps, daemon=True).start()
                return f"Macro '{name}' started."

            last_cmd = getattr(self, "_last_command", "")
            if not last_cmd:
                history = global_memory.get_history()
                for item in reversed(history):
                    if item.startswith("User:"):
                        last_cmd = item[len("User:"):].strip()
                        break
            result = _execute_backend(action_dict, last_cmd)
            print(f"[Api] Execution result: {result}")
            return str(result)
        else:
            return "Error: Could not retrieve action for execution."

    def react_loop(self, goal: str = None, steps_hint_json: str = "[]"):
        """
        Runs the ReAct multi-step loop for a complex goal.
        Streams step updates to the UI via evaluate_js as they complete.
        Runs in a background thread so pywebview does not block.
        
        Args:
            goal:            The user's original goal string. Defaults to the
                             last detected multi-step goal.
            steps_hint_json: JSON array of pre-planned step strings from the
                             classifier (optional, stringified for JS compat).
        """
        if not goal:
            goal = getattr(self, "_last_react_goal", "")
        if not goal:
            return "Error: No goal provided for react_loop."

        try:
            hints = json.loads(steps_hint_json) if steps_hint_json else []
        except Exception:
            hints = getattr(self, "_last_react_hints", [])

        print(f"[Api] react_loop started for goal: {goal!r}")
        self._react_loop_running = True

        def _run():
            try:
                win = webview.windows[0]

                def _push(msg_type: str, text: str):
                    safe_text = json.dumps(str(text))
                    win.evaluate_js(
                        f"if (window.addMessageFromPython) "
                        f"window.addMessageFromPython({json.dumps(msg_type)}, {safe_text});"
                    )

                # Announce start
                _push("react_start", f"🧠 Starting multi-step task: {goal}")
                if hints:
                    plan_str = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(hints))
                    _push("react_plan", f"📋 Planned steps:\n{plan_str}")

                def step_callback(step_index: int, action_dict: dict, result_str: str):
                    action_name = action_dict.get("action", "")
                    if action_name != "done":
                        step_num = step_index + 1
                        _push("react_step", f"⚡ Step {step_num}: {action_name}")
                        if result_str and result_str.lower().startswith("error"):
                            _push("error", result_str)
                        else:
                            _push("react_result", f"  ↳ {result_str}")

                react_result = _run_react_loop(
                    goal=goal,
                    steps_hint=hints,
                    max_steps=10,
                    history=global_memory.get_history(),
                    step_callback=step_callback,
                )

                # Push final summary
                if react_result["completed"] and not react_result["aborted"]:
                    _push("react_done", f"✅ Task complete: {react_result['summary']}")
                    if hints:
                        self._pending_multi_step_suggestion = {
                            "type": "sequence",
                            "steps": hints,
                            "frequency": 1,
                            "is_multi_step": True
                        }
                elif react_result["aborted"]:
                    _push("error", f"⚠️ {react_result['summary']}")
                else:
                    _push("react_done", f"🏁 {react_result['summary']}")

                # Add the result to conversation memory
                summary_action = {"action": "react_complete", "value": react_result["summary"]}
                global_memory.add_agent(summary_action)

            except Exception as e:
                print(f"[Api] react_loop error: {e}")
                try:
                    win = webview.windows[0]
                    win.evaluate_js(
                        f"if (window.addMessageFromPython) "
                        f"window.addMessageFromPython('error', {json.dumps(f'ReAct loop error: {e}')});"
                    )
                except Exception:
                    pass
            finally:
                self._react_loop_running = False

        threading.Thread(target=_run, daemon=True).start()
        return "ReAct loop started."

    def clear_memory(self):
        print("[Api] Clearing memory")
        global_memory.clear()
        return "Cleared"

    # ── Feedback + Tool Suggestions ─────────────────────────────────────────

    def report_feedback(self, feedback_json: str):
        """Receives feedback from the React UI: '{"command":"...", "action_taken":{...}, "correct":true/false, "correct_action":{...}}'

        Appends to execution_log.jsonl.
        """
        print(f"[Api] Feedback received: {feedback_json[:200]}")
        try:
            fb = json.loads(feedback_json)
            with self.file_lock:
                with open(EXECUTION_LOG_PATH, "a", encoding="utf-8") as f:
                    f.write(json.dumps(fb) + "\n")
            return "Feedback recorded"
        except Exception as e:
            return f"Feedback error: {e}"

    def get_tool_suggestions(self):
        """Returns list of missing tools with frequency >= 3 (Phase B)."""
        suggestions = _check_missing_tool_suggestions()
        return json.dumps(suggestions, indent=2)

    def mark_tool_suggested(self, action_name: str):
        """Marks a missing tool as suggested in missing_tools.json so the frontend doesn't re-prompt."""
        missing_tools_file = MISSING_TOOLS_PATH
        try:
            with self.file_lock:
                if not os.path.exists(missing_tools_file):
                    return "File not found"
                with open(missing_tools_file, "r", encoding="utf-8") as f:
                    logs = json.load(f)
                
                updated = False
                for log in logs:
                    if log.get("action_requested") == action_name:
                        log["suggested"] = True
                        updated = True
                        break
                
                if updated:
                    with open(missing_tools_file, "w", encoding="utf-8") as f:
                        json.dump(logs, f, indent=2)
                    return "Marked suggested"
                return "Tool not found"
        except Exception as e:
            return f"Error: {e}"

    def get_sequence_suggestions(self):
        """Returns list of repetitive command sequences with frequency >= 3 that aren't already macros or dismissed."""
        try:
            if getattr(self, "_react_loop_running", False):
                return "[]"

            filtered = []
            
            # Check for a pending multi-step suggestion
            pending = getattr(self, "_pending_multi_step_suggestion", None)
            if pending:
                steps = pending.get("steps", [])
                saved_macros = memory.list_macros()
                saved_steps_lists = list(saved_macros.values())
                
                dismissed_file = os.path.expanduser("~/.jarvis/dismissed_sequences.json")
                dismissed = []
                if os.path.exists(dismissed_file):
                    try:
                        with open(dismissed_file, "r", encoding="utf-8") as f:
                            dismissed = json.load(f)
                    except Exception:
                        pass
                
                if steps not in saved_steps_lists and steps not in dismissed:
                    filtered.append(pending)

            raw_suggestions = memory.detect_repetitive_sequences(min_freq=3)
            # Filter out single-command suggestions to only suggest multi-step macros
            raw_suggestions = [s for s in raw_suggestions if s.get("type") == "sequence"]
            
            # Filter out already saved macros
            saved_macros = memory.list_macros()
            saved_steps_lists = list(saved_macros.values())
            
            # Filter out dismissed suggestions
            dismissed_file = os.path.expanduser("~/.jarvis/dismissed_sequences.json")
            dismissed = []
            if os.path.exists(dismissed_file):
                try:
                    with open(dismissed_file, "r", encoding="utf-8") as f:
                        dismissed = json.load(f)
                except Exception:
                    pass
                    
            for sug in raw_suggestions:
                steps = sug.get("steps", [])
                if steps in saved_steps_lists:
                    continue
                if steps in dismissed:
                    continue
                if any(f.get("steps") == steps for f in filtered):
                    continue
                filtered.append(sug)
                
            return json.dumps(filtered, indent=2)
        except Exception as e:
            print(f"[Api] get_sequence_suggestions error: {e}")
            return "[]"

    def dismiss_sequence_suggestion(self, steps):
        """Saves a sequence to dismissed_sequences.json so it's not suggested again."""
        try:
            if getattr(self, "_pending_multi_step_suggestion", None) and self._pending_multi_step_suggestion.get("steps") == steps:
                self._pending_multi_step_suggestion = None
            dismissed_file = os.path.expanduser("~/.jarvis/dismissed_sequences.json")
            os.makedirs(os.path.dirname(dismissed_file), exist_ok=True)
            dismissed = []
            if os.path.exists(dismissed_file):
                try:
                    with open(dismissed_file, "r", encoding="utf-8") as f:
                        dismissed = json.load(f)
                except Exception:
                    pass
            if steps not in dismissed:
                dismissed.append(steps)
                with open(dismissed_file, "w", encoding="utf-8") as f:
                    json.dump(dismissed, f, indent=2)
            return "ok"
        except Exception as e:
            return f"Error: {e}"

    # ── Provider management ────────────────────────────────────────────────────

    def get_providers(self):
        """Returns list of provider names for the dropdown."""
        names = ["Auto (Fallback)"] + [name for name, _ in _agent_backend.PROVIDERS]
        return names

    def set_provider(self, name: str):
        """Pin the LLM to a specific provider, or None for auto fallback."""
        if name == "Auto (Fallback)":
            _agent_backend.SELECTED_PROVIDER = None
        else:
            _agent_backend.SELECTED_PROVIDER = name
        print(f"[Api] Provider pinned to: {name}")
        return f"Provider set to: {name}"

    def get_active_provider(self):
        """Returns the currently selected provider name."""
        return _agent_backend.SELECTED_PROVIDER or "Auto (Fallback)"

    # ── System stats ───────────────────────────────────────────────────────────

    def get_system_info_quick(self):
        """Returns a small dict with CPU%, RAM used/total for the stats bar."""
        if not _PSUTIL:
            return {"cpu": "--", "ram_used": "--", "ram_total": "--", "ram_pct": "--"}
        try:
            cpu = psutil.cpu_percent(interval=0.3)
            vm  = psutil.virtual_memory()
            return {
                "cpu":       round(cpu, 1),
                "ram_used":  round(vm.used  / (1024 ** 3), 1),
                "ram_total": round(vm.total / (1024 ** 3), 1),
                "ram_pct":   round(vm.percent, 1),
            }
        except Exception as e:
            return {"cpu": "--", "ram_used": "--", "ram_total": "--", "ram_pct": "--"}

    # ── Chat log ───────────────────────────────────────────────────────────────

    def save_chat_log(self, text: str):
        """Copies the given text (chat log) to the clipboard."""
        if _PYPERCLIP:
            try:
                pyperclip.copy(text)
                return "Chat log copied to clipboard."
            except Exception as e:
                return f"Clipboard error: {e}"
        return "pyperclip not installed."

    def download_chat_log(self, text: str):
        """Opens a save file dialog and saves the chat log as a file."""
        try:
            win = webview.windows[0]
            file_path = win.create_file_dialog(webview.SAVE_DIALOG, directory='', file_name='rage_chat_log.txt', file_types=('Text files (*.txt)', 'All files (*.*)'))
            if file_path:
                if isinstance(file_path, (tuple, list)):
                    if len(file_path) > 0:
                        path = file_path[0]
                    else:
                        return "Save cancelled."
                else:
                    path = file_path
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(text)
                return f"Chat log saved to: {os.path.basename(path)}"
            return "Save cancelled."
        except Exception as e:
            print(f"[Api] Download chat log error: {e}")
            return f"Error saving file: {e}"



    # ── Window control ─────────────────────────────────────────────────────────

    def close_window(self):
        """Closes the webview window gracefully."""
        try:
            webview.windows[0].destroy()
        except Exception:
            pass

    def minimize_window(self):
        """Minimizes the webview window."""
        try:
            webview.windows[0].minimize()
        except Exception:
            pass

    def toggle_fullscreen(self):
        """Toggles fullscreen mode on the webview window."""
        try:
            win = webview.windows[0]
            win.toggle_fullscreen()
            return True
        except Exception as e:
            print(f"[Api] toggle_fullscreen error: {e}")
            return False

    def is_fullscreen(self):
        """Returns current fullscreen state."""
        try:
            return bool(webview.windows[0].fullscreen)
        except Exception:
            return False


if __name__ == '__main__':
    api = Api()

    # Path to the React built files — works whether launched from root or scripts/
    _here = os.path.dirname(os.path.abspath(__file__))
    frontend_path = os.path.join(_here, '..', 'frontend', 'dist', 'index.html')
    frontend_path = os.path.normpath(frontend_path)

    if not os.path.exists(frontend_path):
        print(f"Error: Could not find built React app at {frontend_path}")
        print("Please run 'npm run build' inside the 'frontend' directory.")
        sys.exit(1)

    window = webview.create_window(
        title='R.A.G.E. - Windows Automation Agent',
        url=f'file:///{frontend_path.replace(os.sep, "/")}',
        js_api=api,
        width=1200,
        height=760,
        min_size=(900, 600),
        background_color='#0d0505',
        frameless=True,
        easy_drag=False,
    )

    def on_startup(win):
        hooks.register_webview_window(win)
        safety.start_emergency_stop_listener()
        hooks.start_summon_hotkey_listener()
        hooks.start_clipboard_watcher()
        hooks.start_file_watcher()
        hooks.start_notifications_watcher()
        hooks.start_tray_icon(hooks.summon_panel, lambda: os._exit(0))

    webview.start(on_startup, (window,), debug=False)
