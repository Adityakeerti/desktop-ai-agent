import sys

with open('backend/windows_agent.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update log_missing_tool
target1 = '''        logs.append({
            "action_requested": action_requested,
            "timestamp": now,
            "frequency": 1,
            "commands": [command] if command else []
        })'''
replacement1 = '''        logs.append({
            "action_requested": action_requested,
            "timestamp": now,
            "frequency": 1,
            "commands": [command] if command else [],
            "suggested": False
        })'''
content = content.replace(target1, replacement1)

# 2. Update _check_missing_tool_suggestions
target2 = '''    suggestions = [log for log in logs if log.get("frequency", 0) >= 3]'''
replacement2 = '''    suggestions = [log for log in logs if log.get("frequency", 0) >= 3 and not log.get("suggested", False)]'''
content = content.replace(target2, replacement2)

# 3. Update main() suggestion loop
target3 = '''                    ans = input("     Would you like to add this as a custom action? (y/n): ").strip().lower()
                    if ans == "y":
                        print(f"     To add '{action_name}', define it in a new SKILL.md at .agents/skills/{action_name}/SKILL.md")
                        print(f"     Instruction: implement the handler in execute() following the existing pattern.")
                        speak(f"Noted. I'll log {action_name} for future implementation.")
            else:'''
replacement3 = '''                    ans = input("     Would you like to add this as a custom action? (y/n): ").strip().lower()
                    if ans == "y":
                        print(f"     To add '{action_name}', define it in a new SKILL.md at .agents/skills/{action_name}/SKILL.md")
                        print(f"     Instruction: implement the handler in execute() following the existing pattern.")
                        speak(f"Noted. I'll log {action_name} for future implementation.")
                    
                    try:
                        with open("missing_tools.json", "r", encoding="utf-8") as _f:
                            _logs = __import__("json").load(_f)
                        for _l in _logs:
                            if _l.get("action_requested") == action_name:
                                _l["suggested"] = True
                                break
                        with open("missing_tools.json", "w", encoding="utf-8") as _f:
                            __import__("json").dump(_logs, _f, indent=2)
                    except Exception as e:
                        pass
            else:'''
content = content.replace(target3, replacement3)

# 4. Add empty_recycle_bin and turn_off_wifi to prompt
target4 = '''=== SYSTEM ===
{{"action":"run_command","value":"ipconfig /all"}}               - run shell/cmd command'''
replacement4 = '''=== SYSTEM ===
{{"action":"empty_recycle_bin"}}                                 - empty the recycle bin
{{"action":"turn_off_wifi"}}                                     - turn off Wi-Fi
{{"action":"run_command","value":"ipconfig /all"}}               - run shell/cmd command'''
content = content.replace(target4, replacement4)

# 5. Add execution blocks
target5 = '''        # ── System ────────────────────────────────────────────────────────────
        elif a == "run_command":'''
replacement5 = '''        # ── System ────────────────────────────────────────────────────────────
        elif a == "empty_recycle_bin":
            result = __import__("subprocess").run(
                ["powershell", "-NoProfile", "-Command", "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                return "Emptied Recycle Bin (via PowerShell)"
            return f"Failed to empty recycle bin: {result.stderr.strip()}"

        elif a == "turn_off_wifi":
            result = __import__("subprocess").run(
                ["netsh", "wlan", "disconnect"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                return "Disconnected from current Wi-Fi network"
            return f"Failed to disconnect Wi-Fi: {result.stderr.strip()}"

        elif a == "run_command":'''
content = content.replace(target5, replacement5)

# 6. Update whatsapp delay and tab logic
target6 = '''                    # 2. Type contact name
                    pyautogui.write(contact, interval=0.02)
                    time.sleep(4.0)  # Wait for search results to populate (slower load safety)

                    # 3. Select first result
                    # Pressing down arrow moves focus to the top search result
                    pyautogui.press("down")
                    time.sleep(0.3)
                    pyautogui.press("enter")
                    time.sleep(1.5)  # Wait for chat to open'''
replacement6 = '''                    # 2. Type contact name
                    pyautogui.write(contact, interval=0.02)
                    time.sleep(5.0)  # Wait for search results to populate (increased for groups)

                    # 3. Select first result
                    # Pressing down arrow moves focus to the top search result
                    pyautogui.press("down")
                    time.sleep(0.5)
                    pyautogui.press("enter")
                    time.sleep(2.0)  # Wait for chat to open'''
content = content.replace(target6, replacement6)

with open('backend/windows_agent.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch applied.")
