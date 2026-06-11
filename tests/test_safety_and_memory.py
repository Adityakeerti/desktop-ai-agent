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


