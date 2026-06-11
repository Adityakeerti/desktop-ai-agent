import pytest
import os
import json
import backend.safety as safety
import backend.memory as memory
from backend.windows_agent import execute

def test_blocklist_dangerous():
    # Verify blocklist blocks dangerous commands
    is_blocked, reason = safety.is_dangerous({"action": "run_command", "value": "format C:"})
    assert is_blocked
    assert "Blocked" in reason

    is_blocked, reason = safety.is_dangerous({"action": "run_powershell", "value": "del C:\\Windows\\System32"})
    assert is_blocked
    assert "Blocked" in reason

    is_blocked, reason = safety.is_dangerous({"action": "delete_folder", "path": "C:\\Windows\\System32"})
    assert is_blocked
    assert "Blocked" in reason

    # Verify safe command is not blocked
    is_blocked, reason = safety.is_dangerous({"action": "open_app", "value": "notepad"})
    assert not is_blocked

def test_sandbox_mode():
    safety.set_sandbox_mode(True)
    assert safety.is_sandbox_active()

    # In sandbox mode, execution should return dry-run output and not run
    res = execute({"action": "open_app", "value": "notepad"})
    assert "SANDBOX DRY-RUN" in res

    safety.set_sandbox_mode(False)
    assert not safety.is_sandbox_active()

def test_sqlite_macros():
    # Test saving and loading a macro
    name = "test_routine"
    steps = ["open notepad", "type hello", "press_keys ctrl+s"]
    
    assert memory.save_macro(name, steps)
    loaded = memory.get_macro(name)
    assert loaded == steps

    # Test listing macros
    all_macros = memory.list_macros()
    assert name in all_macros
    assert all_macros[name] == steps

    # Test deleting macro
    assert memory.delete_macro(name)
    assert memory.get_macro(name) is None

def test_learned_preferences():
    # Record a test interaction to trigger preference mapping
    cmd = "open my text editor"
    action = {"action": "open_app", "value": "notepad"}
    
    # Clear and set up
    memory.clear_all_memory()
    memory.record_interaction(cmd, action)
    # Record a second time to increase frequency to 2 (or verify with frequency 1)
    memory.record_interaction(cmd, action)
    
    prefs = memory.get_learned_preferences()
    assert len(prefs) >= 1
    assert prefs[0][0] == cmd
    assert prefs[0][1] == action

def test_edit_macro_logic():
    from backend.windows_agent import edit_macro_steps_via_llm
    import backend.windows_agent as wa
    
    original_providers = wa.PROVIDERS
    # Mock provider function that returns modified steps list
    def mock_provider(cmd, history=None):
        return ["open brave", "open whatsapp", "open notepad"]
        
    wa.PROVIDERS = [("MockOllama", mock_provider)]
    try:
        res = edit_macro_steps_via_llm("test_macro", ["open brave", "open whatsapp"], "add open notepad")
        assert res == ["open brave", "open whatsapp", "open notepad"]
    finally:
        wa.PROVIDERS = original_providers

def test_create_macro_action():
    # Verify execute routes create_macro action directly
    memory.delete_macro("test_creation")
    
    res = execute({"action": "create_macro", "name": "test_creation", "steps": ["open paint", "click select"]})
    assert "Successfully created macro" in res
    assert memory.get_macro("test_creation") == ["open paint", "click select"]
    
    # Overwrite check
    res = execute({"action": "create_macro", "name": "test_creation", "steps": ["open cmd"]})
    assert "Successfully overwritten macro" in res
    assert memory.get_macro("test_creation") == ["open cmd"]
    
    memory.delete_macro("test_creation")


def test_log_missing_tool_execution():
    from backend.windows_agent import MISSING_TOOLS_PATH
    # Delete missing tools file if exists
    if os.path.exists(MISSING_TOOLS_PATH):
        try:
            os.remove(MISSING_TOOLS_PATH)
        except Exception:
            pass

    # Execute unknown action
    action = {"action": "unknown_test_action", "value": "some_value"}
    res = execute(action, "run unknown test action")
    
    assert "Unknown action" in res
    assert os.path.exists(MISSING_TOOLS_PATH)
    
    # Load and check content
    with open(MISSING_TOOLS_PATH, "r", encoding="utf-8") as f:
        logs = json.load(f)
        
    assert len(logs) >= 1
    assert logs[0]["action_requested"] == "unknown_test_action"
    assert logs[0]["frequency"] == 1
    assert "run unknown test action" in logs[0]["commands"]

    # Clean up
    if os.path.exists(MISSING_TOOLS_PATH):
        try:
            os.remove(MISSING_TOOLS_PATH)
        except Exception:
            pass


def test_list_macros_action():
    memory.save_macro("test_list_1", ["step1"])
    memory.save_macro("test_list_2", ["step2", "step3"])
    try:
        res = execute({"action": "list_macros"})
        assert "Saved macros:" in res
        assert "test_list_1" in res
        assert "step1" in res
        assert "test_list_2" in res
    finally:
        memory.delete_macro("test_list_1")
        memory.delete_macro("test_list_2")


def test_detect_repetitive_sequences():
    memory.clear_all_memory()
    
    # Simulate user entering commands sequentially
    # Let's say the sequence ["open chrome", "search weather"] is entered 3 times
    sequence = ["open chrome", "search weather"]
    for _ in range(3):
        for cmd in sequence:
            memory.record_interaction(cmd, {"action": "some_action"})
            
    # Also add some unrelated commands so they don't form repeating sequences
    memory.record_interaction("open notepad", {"action": "open_app"})
    memory.record_interaction("type text", {"action": "type_text"})
    
    suggestions = memory.detect_repetitive_sequences(min_freq=3)
    
    # We should have detected our sequence
    seq_suggestions = [s for s in suggestions if s["type"] == "sequence"]
    assert len(seq_suggestions) >= 1
    found = False
    for s in seq_suggestions:
        if s["steps"] == sequence:
            assert s["frequency"] == 3
            found = True
            break
    assert found


def test_destructive_action_blocked_without_confirmation():
    """delete_file and delete_folder should be blocked without confirmed=True in live mode."""
    safety.set_sandbox_mode(False)

    res = execute({"action": "delete_file", "path": "nonexistent_fake_file.txt"}, "delete fake file")
    assert "Action Aborted" in res or "requires explicit confirmation" in res

    res = execute({"action": "delete_folder", "path": "nonexistent_fake_folder"}, "delete fake folder")
    assert "Action Aborted" in res or "requires explicit confirmation" in res


def test_destructive_action_allowed_with_confirmation():
    """delete_file should NOT be blocked when confirmed=True is set."""
    import os, tempfile
    safety.set_sandbox_mode(False)

    # Create a real temp file to delete
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".txt")
    tmp.close()
    tmp_path = tmp.name.replace("\\", "/")

    res = execute({"action": "delete_file", "path": tmp_path, "confirmed": True}, "delete temp file")
    # Result should NOT contain the abort message
    assert "Action Aborted" not in res
    assert "requires explicit confirmation" not in res
    # Cleanup: file should already be deleted
    assert not os.path.exists(tmp_path)


def test_destructive_action_allowed_in_sandbox():
    """In sandbox mode, destructive actions dry-run without the confirmation guard firing."""
    safety.set_sandbox_mode(True)

    res = execute({"action": "delete_file", "path": "fake.txt"}, "delete in sandbox")
    # Should be sandbox dry-run message, NOT the abort message
    assert "SANDBOX DRY-RUN" in res
    assert "Action Aborted" not in res

    safety.set_sandbox_mode(False)


class SequentialMockProvider:
    def __init__(self, actions: list[dict]):
        self.actions = actions
        self.call_count = 0
        
    def __call__(self, command_or_prompt: str, history: list = None) -> dict:
        if self.call_count < len(self.actions):
            act = self.actions[self.call_count]
            self.call_count += 1
            return act
        return {"action": "done", "value": "Finished."}


def test_normalize_windows_command():
    from backend.windows_agent import _normalize_windows_command
    
    # 1. Simple command with forward slashes
    assert _normalize_windows_command("mkdir C:/Users/adity/Desktop/AgentLogs") == "mkdir C:\\Users\\adity\\Desktop\\AgentLogs"
    
    # 2. Command with spaces and quotes
    assert _normalize_windows_command('mkdir "C:/Users/adity/Desktop/Agent Logs"') == 'mkdir "C:\\Users\\adity\\Desktop\\Agent Logs"'
    
    # 3. Switches should be preserved
    assert _normalize_windows_command("ipconfig /all") == "ipconfig /all"
    assert _normalize_windows_command("dir /s /b") == "dir /s /b"
    
    # 4. URLs should be preserved
    assert _normalize_windows_command("curl https://example.com/file") == "curl https://example.com/file"
    
    # 5. Relative paths with forward slashes
    assert _normalize_windows_command("copy file.txt folder/subfolder/file2.txt") == "copy file.txt folder\\subfolder\\file2.txt"


def test_react_create_folder_clipboard_cpu():
    import backend.windows_agent as wa
    import tempfile
    import shutil
    import os
    
    temp_dir = tempfile.mkdtemp().replace("\\", "/")
    
    actions = [
        {"action": "create_folder", "path": f"{temp_dir}/AgentLogs"},
        {"action": "get_clipboard"},
        {"action": "create_file", "path": f"{temp_dir}/AgentLogs/logs.txt", "content": "mocked clipboard contents"},
        {"action": "get_system_info"},
        {"action": "done", "value": "Successfully created folder, wrote clipboard, and retrieved system info."}
    ]
    
    mock_provider = SequentialMockProvider(actions)
    original_providers = wa.PROVIDERS
    wa.PROVIDERS = [("MockProvider", mock_provider)]
    
    try:
        res = wa.run_react_loop(
            goal=f"Create a folder named AgentLogs in {temp_dir}, copy my clipboard contents into a new file logs.txt inside it, and get my CPU usage.",
            max_steps=10
        )
        assert res["completed"]
        assert not res["aborted"]
        assert len(res["steps"]) == 4
        
        assert os.path.isdir(f"{temp_dir}/AgentLogs")
        assert os.path.isfile(f"{temp_dir}/AgentLogs/logs.txt")
        with open(f"{temp_dir}/AgentLogs/logs.txt", "r", encoding="utf-8") as f:
            assert f.read() == "mocked clipboard contents"
    finally:
        wa.PROVIDERS = original_providers
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_react_weather_speak_volume():
    import backend.windows_agent as wa
    
    actions = [
        {"action": "get_weather", "city": "Tokyo"},
        {"action": "say", "value": "Weather in Tokyo is +22°C"},
        {"action": "set_volume", "value": 70},
        {"action": "done", "value": "Checked weather, spoke out loud, and set volume to 70%."}
    ]
    
    mock_provider = SequentialMockProvider(actions)
    original_providers = wa.PROVIDERS
    wa.PROVIDERS = [("MockProvider", mock_provider)]
    
    import backend.safety as safety
    safety.set_sandbox_mode(True)
    
    try:
        res = wa.run_react_loop(
            goal="Check the weather in Tokyo, tell me about it out loud, and set system volume to 70 percent.",
            max_steps=10
        )
        assert res["completed"]
        assert not res["aborted"]
        assert len(res["steps"]) == 3
        
        assert res["steps"][0]["action"] == "get_weather"
        assert res["steps"][1]["action"] == "say"
        assert res["steps"][2]["action"] == "set_volume"
    finally:
        wa.PROVIDERS = original_providers
        safety.set_sandbox_mode(False)


def test_react_loop_protection():
    import backend.windows_agent as wa
    
    failing_action = {"action": "run_command", "value": "invalid_command_name"}
    
    class RepeatingMockProvider:
        def __call__(self, command_or_prompt: str, history: list = None) -> dict:
            return failing_action
            
    mock_provider = RepeatingMockProvider()
    original_providers = wa.PROVIDERS
    wa.PROVIDERS = [("MockProvider", mock_provider)]
    
    try:
        res = wa.run_react_loop(
            goal="Create AgentLogs folder on Desktop using invalid command syntax.",
            max_steps=10
        )
        assert res["aborted"]
        assert not res["completed"]
        assert len(res["steps"]) == 2
        assert "infinite loop" in res["summary"].lower()
    finally:
        wa.PROVIDERS = original_providers


def test_react_three_desktop_actions():
    import backend.windows_agent as wa
    
    actions = [
        {"action": "open_url", "value": "https://youtube.com"},
        {"action": "open_url", "value": "https://claude.ai"},
        {"action": "open_app", "value": "visual studio code"},
        {"action": "done", "value": "Opened YouTube, Claude, and VS Code."}
    ]
    
    mock_provider = SequentialMockProvider(actions)
    original_providers = wa.PROVIDERS
    wa.PROVIDERS = [("MockProvider", mock_provider)]
    
    import backend.safety as safety
    safety.set_sandbox_mode(True)
    
    try:
        res = wa.run_react_loop(
            goal="open youtube.com, claude.ai and then open VS Code",
            max_steps=10
        )
        assert res["completed"]
        assert not res["aborted"]
        assert len(res["steps"]) == 3
        assert res["steps"][0]["action"] == "open_url"
        assert res["steps"][1]["action"] == "open_url"
        assert res["steps"][2]["action"] == "open_app"
    finally:
        wa.PROVIDERS = original_providers
        safety.set_sandbox_mode(False)



