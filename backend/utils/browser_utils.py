import os
import uuid
import base64
import sqlite3
import time
import shutil
import tempfile
import urllib.parse
import requests
from hashlib import sha256
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
from cryptography.fernet import Fernet

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "credentials.db")

def get_machine_key() -> bytes:
    mac = str(uuid.getnode())
    comp_name = os.environ.get("COMPUTERNAME", "default_machine")
    raw_key = (mac + comp_name).encode('utf-8')
    hashed = sha256(raw_key).digest()
    return base64.urlsafe_b64encode(hashed)

def init_credentials_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT NOT NULL,
            username TEXT NOT NULL,
            encrypted_password TEXT NOT NULL,
            UNIQUE(service, username)
        )
    """)
    conn.commit()
    conn.close()

def store_credential(service: str, username: str, password_plain: str) -> bool:
    init_credentials_db()
    key = get_machine_key()
    fernet = Fernet(key)
    enc_password = fernet.encrypt(password_plain.encode('utf-8')).decode('utf-8')
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO credentials (service, username, encrypted_password)
            VALUES (?, ?, ?)
            ON CONFLICT(service, username) DO UPDATE SET encrypted_password=excluded.encrypted_password
        """, (service, username, enc_password))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error storing credential: {e}")
        return False
    finally:
        conn.close()

def get_credential(service: str, username: str = None) -> list[dict]:
    init_credentials_db()
    key = get_machine_key()
    fernet = Fernet(key)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        if username:
            cursor.execute("SELECT username, encrypted_password FROM credentials WHERE service = ? AND username = ?", (service, username))
        else:
            cursor.execute("SELECT username, encrypted_password FROM credentials WHERE service = ?", (service,))
        
        rows = cursor.fetchall()
        results = []
        for row in rows:
            user, enc_pw = row
            try:
                dec_pw = fernet.decrypt(enc_pw.encode('utf-8')).decode('utf-8')
                results.append({
                    "service": service,
                    "username": user,
                    "password": dec_pw
                })
            except Exception:
                continue
        return results
    except Exception as e:
        print(f"Error getting credential: {e}")
        return []
    finally:
        conn.close()

def delete_credential(service: str, username: str) -> bool:
    init_credentials_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM credentials WHERE service = ? AND username = ?", (service, username))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error deleting credential: {e}")
        return False
    finally:
        conn.close()

def search_browser_history(query: str, browser: str = "chrome") -> list[dict]:
    user_profile = os.environ.get("USERPROFILE", "")
    paths = {
        "chrome": os.path.join(user_profile, r"AppData\Local\Google\Chrome\User Data\Default\History"),
        "edge": os.path.join(user_profile, r"AppData\Local\Microsoft\Edge\User Data\Default\History")
    }
    
    db_path = paths.get(browser.lower())
    if not db_path or not os.path.exists(db_path):
        return []
        
    results = []
    with tempfile.TemporaryDirectory() as tmpdir:
        temp_db = os.path.join(tmpdir, "History_Copy")
        try:
            shutil.copy2(db_path, temp_db)
            conn = sqlite3.connect(temp_db)
            cursor = conn.cursor()
            q = f"%{query}%"
            cursor.execute("""
                SELECT url, title, visit_count, datetime(last_visit_time/1000000 - 11644473600, 'unixepoch', 'localtime') as last_visit
                FROM urls
                WHERE url LIKE ? OR title LIKE ?
                ORDER BY last_visit_time DESC
                LIMIT 20
            """, (q, q))
            for row in cursor.fetchall():
                results.append({
                    "url": row[0],
                    "title": row[1],
                    "visit_count": row[2],
                    "last_visit": row[3]
                })
            conn.close()
        except Exception as e:
            print(f"Error reading browser history: {e}")
            
    return results

def scrape_web_page(url: str, selector: str = None, wait_for: str = None) -> dict:
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.set_extra_http_headers({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            
            if wait_for:
                try:
                    page.wait_for_selector(wait_for, timeout=5000)
                except Exception:
                    pass
            
            html = page.content()
            title = page.title()
            
            soup = BeautifulSoup(html, "html.parser")
            for script in soup(["script", "style", "noscript", "iframe", "header", "footer", "nav"]):
                script.decompose()
                
            text = soup.get_text(separator="\n")
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            clean_text = "\n".join(chunk for chunk in chunks if chunk)
            
            extracted_items = []
            if selector:
                elements = page.query_selector_all(selector)
                for el in elements:
                    el_html = el.inner_html()
                    el_text = el.inner_text().strip()
                    attrs = {}
                    try:
                        href = el.get_attribute("href")
                        if href: attrs["href"] = urllib.parse.urljoin(url, href)
                    except Exception:
                        pass
                    try:
                        src = el.get_attribute("src")
                        if src: attrs["src"] = urllib.parse.urljoin(url, src)
                    except Exception:
                        pass
                    extracted_items.append({
                        "text": el_text,
                        "html": el_html,
                        "attributes": attrs
                    })
                    
            browser.close()
            return {
                "title": title,
                "text": clean_text[:5000],
                "extracted_elements": extracted_items
            }
    except Exception as e:
        return {"error": str(e)}

def download_page_images(url: str, output_dir: str = None) -> list[str]:
    if not output_dir:
        output_dir = os.path.join(os.getcwd(), "downloads")
    os.makedirs(output_dir, exist_ok=True)
    
    downloaded = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, timeout=30000, wait_until="domcontentloaded")
            
            images = page.query_selector_all("img")
            img_urls = []
            for img in images:
                src = img.get_attribute("src")
                if src:
                    img_urls.append(urllib.parse.urljoin(url, src))
                    
            browser.close()
            
            img_urls = list(set(img_urls))
            
            for i, img_url in enumerate(img_urls[:15]):
                try:
                    parsed = urllib.parse.urlparse(img_url)
                    filename = os.path.basename(parsed.path)
                    if not filename or not filename.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")):
                        filename = f"image_{i}_{int(time.time())}.jpg"
                        
                    save_path = os.path.join(output_dir, filename)
                    resp = requests.get(img_url, timeout=10)
                    resp.raise_for_status()
                    with open(save_path, "wb") as f:
                        f.write(resp.content)
                    downloaded.append(save_path.replace("\\", "/"))
                except Exception as e:
                    print(f"Failed to download image {img_url}: {e}")
                    
    except Exception as e:
        print(f"Error in download_page_images: {e}")
        
    return downloaded

def fill_web_form(url: str, actions: list[dict]) -> str:
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, timeout=30000)
            
            for action in actions:
                sel = action.get("selector")
                act_type = action.get("action")
                val = action.get("value")
                
                if not sel:
                    continue
                    
                page.wait_for_selector(sel, timeout=5000)
                if act_type == "fill" or act_type == "type":
                    page.fill(sel, str(val))
                elif act_type == "click":
                    page.click(sel)
                elif act_type == "check":
                    page.check(sel)
                elif act_type == "select":
                    page.select_option(sel, str(val))
                    
            page.wait_for_load_state("load", timeout=5000)
            final_url = page.url
            title = page.title()
            browser.close()
            return f"Successfully filled form. Final URL: {final_url}, Title: {title}"
    except Exception as e:
        return f"Error filling web form: {e}"
