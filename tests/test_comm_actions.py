import os
import pytest
from backend.windows_agent import execute

def test_local_calendar_actions():
    subject = "Meeting with Jarvis"
    start_time = "2026-06-15 14:00"
    duration = 45
    location = "Stark Tower"
    body = "Discuss antigravity flight controls."
    
    # 1. Create event
    res_create = execute({
        "action": "create_calendar_event",
        "subject": subject,
        "start": start_time,
        "duration": duration,
        "location": location,
        "body": body
    })
    assert "created successfully" in res_create
    
    # 2. List events
    res_list = execute({
        "action": "list_calendar_events",
        "limit": 5
    })
    assert subject in res_list
    assert start_time in res_list
    
    # 3. Delete event
    res_delete = execute({
        "action": "delete_calendar_event",
        "subject": subject
    })
    assert "Deleted" in res_delete
    
    # Verify no longer in list
    res_list_after = execute({
        "action": "list_calendar_events"
    })
    assert subject not in res_list_after

def test_email_actions():
    # Fetch emails (should complete successfully and not crash)
    res_fetch = execute({
        "action": "fetch_emails",
        "limit": 2
    })
    # Could be empty if no Outlook/config, or could return emails
    assert isinstance(res_fetch, str)

def test_get_active_notifications():
    res_notes = execute({
        "action": "get_active_notifications"
    })
    assert isinstance(res_notes, str)

def test_compile_daily_briefing():
    res_briefing = execute({
        "action": "compile_daily_briefing",
        "city": "London"
    })
    # Briefing should contain main sections or fallback details
    assert "Daily Briefing" in res_briefing or "briefing" in res_briefing.lower()
