import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_power_commands():
    print("=" * 60)
    print("TESTING POWER MANAGEMENT & DEFERRED POWER COMMANDS")
    print("=" * 60)

    # 1. Test scheduling a sleep command (with a long delay so it doesn't fire)
    print("\n[Test 1] Scheduling a sleep command for 3600 seconds (1 hour)...")
    res1 = execute({"action": "power_command", "type": "sleep", "delay": 3600})
    print(f"Result: {res1}")
    assert "Scheduled system sleep" in res1
    assert "3600 seconds" in res1

    # Check that a timer exists in globals
    import backend.windows_agent as wa
    assert hasattr(wa, "ACTIVE_POWER_TIMERS")
    assert "power_timer" in wa.ACTIVE_POWER_TIMERS
    print("✓ Custom Timer successfully registered in ACTIVE_POWER_TIMERS.")

    # 2. Test aborting the scheduled command
    print("\n[Test 2] Aborting all scheduled power commands...")
    res2 = execute({"action": "power_command", "type": "abort"})
    print(f"Result: {res2}")
    assert "Cancelled pending power commands" in res2
    assert "power_timer" not in wa.ACTIVE_POWER_TIMERS
    print("✓ Custom Timer successfully cancelled and cleared.")

    # 3. Test scheduling a native shutdown (with 3600 seconds delay)
    print("\n[Test 3] Scheduling a native shutdown for 3600 seconds (1 hour)...")
    res3 = execute({"action": "power_command", "type": "shutdown", "delay": 3600})
    print(f"Result: {res3}")
    assert "Scheduled system shutdown" in res3

    # Cancel the native shutdown
    print("\n[Cleanup] Aborting native shutdown...")
    res_clean = execute({"action": "power_command", "type": "abort"})
    print(f"Cleanup Result: {res_clean}")

    print("\n" + "=" * 60)
    print("ALL POWER MANAGEMENT TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

