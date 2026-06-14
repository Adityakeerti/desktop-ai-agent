import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute
import backend.windows_agent as wa

def test_pomodoro():
    print("=" * 60)
    print("TESTING POMODORO TIMER BACKGROUND DAEMON")
    print("=" * 60)

    # 1. Start a 3-second test session
    print("\nStarting a 3-second focus session...")
    res = execute({"action": "start_pomodoro", "duration_seconds": 3, "label": "Short Test"})
    print(f"Result: {res}")
    assert "Successfully started Pomodoro" in res
    
    # Check that thread is running
    assert wa.POMODORO_THREAD is not None
    assert not wa.POMODORO_CANCELLED
    print("OK: Focus session started and background thread is active.")

    # 2. Wait for it to complete
    print("\nWaiting 4 seconds for focus session to complete...")
    time.sleep(4)
    
    # Check that thread has finished and cleaned up
    assert wa.POMODORO_THREAD is None
    print("OK: Focus session completed and thread cleaned up successfully.")

    # 3. Start a new session and stop it early
    print("\nStarting another focus session...")
    res = execute({"action": "start_pomodoro", "duration_seconds": 10, "label": "Cancel Test"})
    print(f"Result: {res}")
    assert wa.POMODORO_THREAD is not None

    print("\nStopping focus session early...")
    res = execute({"action": "stop_pomodoro"})
    print(f"Result: {res}")
    assert "timer stopped" in res
    
    # Wait a brief moment for thread shutdown
    time.sleep(0.5)
    assert wa.POMODORO_THREAD is None
    print("OK: Focus session cancelled and thread stopped successfully.")

    print("\n" + "=" * 60)
    print("ALL POMODORO TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

