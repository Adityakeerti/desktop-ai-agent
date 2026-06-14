import os
import tempfile
import pytest
from backend.windows_agent import execute

def test_credentials_vault():
    service = "test_service_xyz"
    username = "test_user"
    password = "secret_password_123"
    
    # Store
    res_store = execute({
        "action": "store_credential",
        "service": service,
        "username": username,
        "password": password
    })
    assert "Successfully stored" in res_store
    
    # Get
    res_get = execute({
        "action": "get_credential",
        "service": service,
        "username": username
    })
    assert f"Username: {username}" in res_get
    assert f"Password: {password}" in res_get
    
    # Delete
    res_del = execute({
        "action": "delete_credential",
        "service": service,
        "username": username
    })
    assert "Successfully deleted" in res_del
    
    # Verify deleted
    res_get_after = execute({
        "action": "get_credential",
        "service": service
    })
    assert "No credentials found" in res_get_after

def test_browser_scraping_and_form():
    # Create a local temporary HTML file to test Playwright offline
    html_content = """
    <html>
      <head><title>Mock Shop</title></head>
      <body>
        <h1>Welcome to Mock Shop</h1>
        <p class="price">$19.99</p>
        <a href="product.html">Product Link</a>
        <img src="product.jpg" />
        
        <form id="login-form">
          <input type="text" id="username" name="user" />
          <input type="checkbox" id="agree" />
        </form>
      </body>
    </html>
    """
    
    with tempfile.NamedTemporaryFile(mode="w+", delete=False, suffix=".html", encoding="utf-8") as tmp:
        tmp.write(html_content)
        tmp_path = tmp.name
        
    url = "file:///" + tmp_path.replace("\\", "/")
    
    try:
        # 1. Scrape web page
        res_scrape = execute({
            "action": "scrape_web_page",
            "url": url,
            "selector": ".price"
        })
        assert "Title: Mock Shop" in res_scrape
        assert "Mock Shop" in res_scrape
        assert "$19.99" in res_scrape
        assert "Extracted Elements" in res_scrape
        
        # 2. Fill web form
        res_form = execute({
            "action": "fill_web_form",
            "url": url,
            "actions": [
                {"selector": "#username", "action": "fill", "value": "my_test_user"},
                {"selector": "#agree", "action": "check"}
            ]
        })
        assert "Successfully filled form" in res_form
        
        # 3. Download images (checking resolving Relative URLs)
        res_images = execute({
            "action": "download_page_images",
            "url": url,
            "output": os.path.dirname(tmp_path).replace("\\", "/")
        })
        assert "downloaded" in res_images.lower()
        
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
            
def test_search_browser_history_empty():
    # Test non-existent search doesn't fail
    res = execute({
        "action": "search_browser_history",
        "query": "non_existent_history_entry_12345",
        "browser": "chrome"
    })
    assert "No browser history entries found" in res
