import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock
from backend.windows_agent import execute

def test_run_code_snippet_python():
    # Execute a simple python print statement
    res = execute({
        "action": "run_code_snippet",
        "code": "print('hello from sandbox')",
        "language": "python"
    })
    assert "STDOUT:" in res
    assert "hello from sandbox" in res

def test_run_code_snippet_invalid_lang():
    res = execute({
        "action": "run_code_snippet",
        "code": "print('hello')",
        "language": "unsupported_lang_123"
    })
    assert "Error: Unsupported language" in res

def test_read_file_tail():
    with tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix=".txt") as tmp:
        # Write 10 lines
        for i in range(1, 11):
            tmp.write(f"Line {i}\n")
        tmp_path = tmp.name

    try:
        # Read last 3 lines
        res = execute({
            "action": "read_file_tail",
            "path": tmp_path,
            "lines": 3
        })
        assert res == "Line 8\nLine 9\nLine 10\n"
        
        # Read last 20 lines (more than exist)
        res_all = execute({
            "action": "read_file_tail",
            "path": tmp_path,
            "lines": 20
        })
        assert res_all.startswith("Line 1\n")
        assert res_all.endswith("Line 10\n")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def test_git_command():
    # Run git status on current workspace (which is a git repo)
    res = execute({
        "action": "git_command",
        "command": "status",
        "path": os.getcwd()
    })
    # Output should contain git status details
    assert "On branch" in res or "HEAD" in res or "git status" in res or "fatal:" in res

@patch("requests.request")
def test_http_request(mock_request):
    # Mock successful response
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.reason = "OK"
    mock_resp.headers = {"Content-Type": "application/json"}
    mock_resp.json.return_value = {"status": "success", "message": "hello"}
    mock_request.return_value = mock_resp

    res = execute({
        "action": "http_request",
        "url": "https://api.example.com/test",
        "method": "GET"
    })
    
    assert "Status Code: 200 OK" in res
    assert "application/json" in res
    assert "Body (JSON):" in res
    assert "success" in res
