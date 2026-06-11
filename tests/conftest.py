"""
conftest.py — pytest session-wide fixture that redirects backend.memory to a
TEMPORARY database for the entire test run.

Why this exists
───────────────
backend/memory.py uses ~/.jarvis/memory.db — the same file that the running
agent uses in production.  Without isolation the following test functions
wipe the user's real saved macros and interaction history:
  • test_learned_preferences      → memory.clear_all_memory()
  • test_detect_repetitive_sequences → memory.clear_all_memory()

This conftest patches memory.DB_PATH and memory.DB_DIR to a tempfile BEFORE
any test module is imported, so every test operates on a throwaway database
and the production file is never touched.
"""
import os
import tempfile
import pytest
import backend.memory as memory


@pytest.fixture(autouse=True, scope="session")
def isolated_test_db(tmp_path_factory):
    """Redirect all memory DB operations to a temp file for the entire session."""
    tmp_dir = tmp_path_factory.mktemp("jarvis_test_db")
    test_db_path = str(tmp_dir / "test_memory.db")

    # Patch the module-level constants before any test runs
    original_db_dir = memory.DB_DIR
    original_db_path = memory.DB_PATH

    memory.DB_DIR = str(tmp_dir)
    memory.DB_PATH = test_db_path

    # Also set an env var in case any code re-reads it
    os.environ["JARVIS_TEST_DB"] = test_db_path

    yield test_db_path   # tests run here

    # Restore (matters if you're running tests alongside the agent)
    memory.DB_DIR = original_db_dir
    memory.DB_PATH = original_db_path
    os.environ.pop("JARVIS_TEST_DB", None)
