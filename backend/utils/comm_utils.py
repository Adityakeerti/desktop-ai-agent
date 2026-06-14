import os
import sys
import sqlite3
import asyncio
import smtplib
from email.mime.text import MIMEText

CALENDAR_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "calendar.db")

def get_outlook_client():
    try:
        import win32com.client
        # Dispatch a new Outlook client
        return win32com.client.Dispatch("Outlook.Application")
    except Exception:
        return None

# ── Email Actions ─────────────────────────────────────────────────────────────

def send_email(to: str, subject: str, body: str) -> str:
    outlook = get_outlook_client()
    if outlook:
        try:
            mail = outlook.CreateItem(0) # 0 = olMailItem
            mail.To = to
            mail.Subject = subject
            mail.Body = body
            mail.Send()
            return "Email sent successfully via Outlook COM Bridge."
        except Exception as e:
            return f"Outlook send failed ({e}), trying SMTP fallback..."
            
    # SMTP Fallback
    smtp_server = os.environ.get("SMTP_SERVER")
    smtp_port = os.environ.get("SMTP_PORT", "587")
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    
    if not smtp_server or not smtp_user or not smtp_password:
        return "Error: Outlook is unavailable and SMTP settings (SMTP_SERVER, SMTP_USER, SMTP_PASSWORD) are not configured."
        
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = to
        
        with smtplib.SMTP(smtp_server, int(smtp_port)) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        return "Email sent successfully via SMTP."
    except Exception as e:
        return f"Error sending email: {e}"

def draft_email(to: str, subject: str, body: str) -> str:
    outlook = get_outlook_client()
    if outlook:
        try:
            mail = outlook.CreateItem(0)
            mail.To = to
            mail.Subject = subject
            mail.Body = body
            mail.Save()
            return "Email draft saved successfully in Outlook."
        except Exception as e:
            return f"Error saving draft in Outlook: {e}"
    return "Error: Outlook COM interface is not available to create drafts locally."

def fetch_emails(limit: int = 5) -> list[dict]:
    outlook = get_outlook_client()
    if outlook:
        try:
            namespace = outlook.GetNamespace("MAPI")
            inbox = namespace.GetDefaultFolder(6) # 6 = olFolderInbox
            messages = inbox.Items
            messages.Sort("[ReceivedTime]", True)
            results = []
            for i in range(min(limit, len(messages))):
                try:
                    m = messages[i]
                    results.append({
                        "sender": getattr(m, "SenderName", "Unknown"),
                        "subject": getattr(m, "Subject", "No Subject"),
                        "body": getattr(m, "Body", "")[:300].strip(),
                        "time": str(getattr(m, "ReceivedTime", ""))
                    })
                except Exception:
                    continue
            return results
        except Exception as e:
            print(f"Error fetching Outlook emails: {e}")
            
    # Return empty list or sample if Outlook is missing
    return []

# ── Calendar Actions ──────────────────────────────────────────────────────────

def init_local_calendar():
    conn = sqlite3.connect(CALENDAR_DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT NOT NULL,
            start_time TEXT NOT NULL,
            duration INTEGER NOT NULL,
            location TEXT,
            body TEXT
        )
    """)
    conn.commit()
    conn.close()

def create_calendar_event(subject: str, start_time: str, duration_minutes: int, location: str = "", body: str = "") -> str:
    outlook = get_outlook_client()
    if outlook:
        try:
            appt = outlook.CreateItem(1) # 1 = olAppointmentItem
            appt.Subject = subject
            appt.Start = start_time
            appt.Duration = duration_minutes
            appt.Location = location
            appt.Body = body
            appt.Save()
            return f"Calendar event '{subject}' created successfully in Outlook."
        except Exception as e:
            print(f"Outlook calendar creation failed: {e}. Saving to local calendar...")
            
    # Local SQLite Fallback
    try:
        init_local_calendar()
        conn = sqlite3.connect(CALENDAR_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO events (subject, start_time, duration, location, body) VALUES (?, ?, ?, ?, ?)",
                       (subject, start_time, duration_minutes, location, body))
        conn.commit()
        conn.close()
        return f"Calendar event '{subject}' created successfully in local database."
    except Exception as e:
        return f"Error creating calendar event: {e}"

def list_calendar_events(limit: int = 10) -> list[dict]:
    outlook = get_outlook_client()
    if outlook:
        try:
            namespace = outlook.GetNamespace("MAPI")
            calendar = namespace.GetDefaultFolder(9) # 9 = olFolderCalendar
            items = calendar.Items
            items.Sort("[Start]", False)
            results = []
            for i in range(min(limit, len(items))):
                try:
                    item = items[i]
                    results.append({
                        "subject": getattr(item, "Subject", "No Title"),
                        "start": str(getattr(item, "Start", "")),
                        "duration": getattr(item, "Duration", 0),
                        "location": getattr(item, "Location", "")
                    })
                except Exception:
                    continue
            return results
        except Exception as e:
            print(f"Outlook calendar fetch failed: {e}. Reading from local calendar...")
            
    # Local SQLite Fallback
    try:
        init_local_calendar()
        conn = sqlite3.connect(CALENDAR_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT subject, start_time, duration, location, body FROM events ORDER BY start_time ASC LIMIT ?", (limit,))
        rows = cursor.fetchall()
        conn.close()
        return [{"subject": r[0], "start": r[1], "duration": r[2], "location": r[3], "body": r[4]} for r in rows]
    except Exception as e:
        print(f"Error reading local calendar: {e}")
        return []

def delete_calendar_event(subject: str) -> str:
    outlook = get_outlook_client()
    outlook_deleted = False
    count = 0
    
    if outlook:
        try:
            namespace = outlook.GetNamespace("MAPI")
            calendar = namespace.GetDefaultFolder(9)
            items = calendar.Items
            for item in list(items):
                if getattr(item, "Subject", "").lower() == subject.lower():
                    item.Delete()
                    count += 1
            outlook_deleted = True
        except Exception as e:
            print(f"Outlook calendar deletion failed: {e}")
            
    # Local SQLite deletion
    try:
        init_local_calendar()
        conn = sqlite3.connect(CALENDAR_DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM events WHERE LOWER(subject) = LOWER(?)", (subject,))
        local_count = cursor.rowcount
        conn.commit()
        conn.close()
        
        if outlook_deleted:
            return f"Deleted {count} event(s) from Outlook."
        else:
            return f"Deleted {local_count} event(s) from local database."
    except Exception as e:
        return f"Error deleting calendar event: {e}"

# ── Notifications ─────────────────────────────────────────────────────────────

async def get_active_notifications_async() -> list[dict]:
    try:
        from winrt.windows.ui.notifications.management import UserNotificationListener
        from winrt.windows.ui.notifications import NotificationKinds
        
        listener = UserNotificationListener.current
        status = await listener.request_access_async()
        if status != 1: # 1 = Allowed
            return [{"error": "Permission denied for notifications access."}]
            
        notes = await listener.get_notifications_async(NotificationKinds.TOAST)
        results = []
        for note in notes:
            try:
                app_name = note.app_info.display_info.display_name
            except Exception:
                app_name = "Unknown App"
                
            texts = []
            try:
                for b in note.notification.visual.bindings:
                    for el in b.get_text_elements():
                        if el.text and el.text.strip():
                            texts.append(el.text.strip())
            except Exception:
                pass
                
            results.append({
                "id": note.id,
                "app": app_name,
                "texts": texts
            })
        return results
    except Exception as e:
        return [{"error": str(e)}]

def get_active_notifications() -> list[dict]:
    try:
        return asyncio.run(get_active_notifications_async())
    except Exception as e:
        return [{"error": str(e)}]
