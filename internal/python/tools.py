import subprocess
import requests
import re
import os
import urllib.parse
from datetime import datetime, timedelta
import uuid
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS
from duckduckgo_search import DDGS

ALLOWED_COMMANDS = ['notepad', 'calc', 'explorer', 'chrome', 'cmd']

def extract_website_text(url: str) -> str:
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Kill all script and style elements
        for script in soup(["script", "style", "nav", "footer", "header"]):
            script.extract()
            
        # Get text
        text = soup.get_text(separator=' ')
        
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        # Limit text to ~25000 characters to prevent context overflow
        return text[:25000]
    except Exception as e:
        return f"Error extracting website: {e}"

def draft_email(to_email: str, subject: str, body: str) -> str:
    try:
        subject_enc = urllib.parse.quote(subject)
        body_enc = urllib.parse.quote(body)
        mailto_url = f"mailto:{to_email}?subject={subject_enc}&body={body_enc}"
        os.startfile(mailto_url)
        return "Successfully opened the default email client with the drafted email."
    except Exception as e:
        return f"Failed to draft email: {e}"

def create_calendar_event(title: str) -> str:
    try:
        start_time = datetime.now() + timedelta(days=1)
        end_time = start_time + timedelta(hours=1)
        
        dtstamp = datetime.now().strftime("%Y%m%dT%H%M%SZ")
        dtstart = start_time.strftime("%Y%m%dT%H%M%S")
        dtend = end_time.strftime("%Y%m%dT%H%M%S")
        
        ics_content = f"BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//JARVIS//AI Assistant//EN\nBEGIN:VEVENT\nUID:{uuid.uuid4()}\nDTSTAMP:{dtstamp}\nDTSTART:{dtstart}\nDTEND:{dtend}\nSUMMARY:{title}\nDESCRIPTION:Scheduled by JARVIS\nEND:VEVENT\nEND:VCALENDAR"
        
        temp_dir = os.environ.get('TEMP', 'C:\\Temp')
        file_path = os.path.join(temp_dir, f"jarvis_event_{uuid.uuid4().hex[:6]}.ics")
        with open(file_path, "w") as f:
            f.write(ics_content)
            
        os.startfile(file_path)
        return "Successfully generated and opened the calendar event."
    except Exception as e:
        return f"Failed to create calendar event: {e}"

def execute_agentic_tools(query: str, rag_engine=None) -> str:
    """
    Manually parses the query for agentic tool triggers.
    Returns injected system context if a tool was triggered, otherwise empty string.
    """
    query_lower = query.lower().strip()
    
    # 0. Long Term Memory Trigger
    if any(query_lower.startswith(prefix) for prefix in ["jarvis, remember that ", "remember that ", "memorize this: "]):
        fact = query_lower.replace("jarvis, remember that ", "").replace("remember that ", "").replace("memorize this: ", "").strip()
        if rag_engine:
            try:
                mem_id = rag_engine.inject_memory(fact)
                return f"[SYSTEM INJECTION: You have successfully and permanently stored the fact '{fact}' in your long-term memory vector database with ID {mem_id}. Inform the user that you will remember this.]\n\n"
            except Exception as e:
                return f"[SYSTEM INJECTION: You tried to remember a fact but the vector database threw an error: {e}]\n\n"

    # 1. Deep Web Scraping Trigger
    url_match = re.search(r'(https?://[^\s]+)', query)
    if any(query_lower.startswith(prefix) for prefix in ["jarvis, read ", "read ", "jarvis, summarize ", "summarize ", "scrape "]) and url_match:
        url = url_match.group(1)
        scraped_text = extract_website_text(url)
        return f"[SYSTEM INJECTION: The user asked to read or summarize the website {url}. Here is the extracted raw text of the website:\n\n{scraped_text}\n\nUse this extracted text to fulfill the user's request.]\n\n"

    # 2. Email Trigger
    if "draft an email" in query_lower or "write an email" in query_lower:
        result = draft_email("", "Drafted by JARVIS", "Hello,\n\n[JARVIS drafted this email based on your request...]\n\nBest,\nUser")
        return f"[SYSTEM INJECTION: {result}. Inform the user that their default email client has been opened so they can fill in the recipient and click send.]\n\n"

    # 3. Calendar Trigger
    if "schedule a meeting" in query_lower or "schedule an event" in query_lower:
        title = "Meeting"
        if "with" in query_lower:
            title = "Meeting " + query_lower.split("with")[1].strip()
        result = create_calendar_event(title)
        return f"[SYSTEM INJECTION: {result}. Inform the user that the calendar app has been opened with a draft event for tomorrow.]\n\n"

    # 2. System Command Trigger
    if "open " in query_lower:
        app_name = query_lower.split("open ", 1)[1].strip()
        app_name = app_name.replace("the ", "").replace("my ", "").strip()
        
        # Aliases
        if "calculator" in app_name:
            app_name = "calc"
            
        if app_name in ALLOWED_COMMANDS:
            try:
                subprocess.Popen(app_name, shell=True)
                return f"[SYSTEM INJECTION: You successfully executed the system command to open '{app_name}'. Inform the user.]\n\n"
            except Exception as e:
                return f"[SYSTEM INJECTION: You attempted to open '{app_name}' but it failed with error: {e}]\n\n"
        else:
            return f"[SYSTEM INJECTION: The user asked to open '{app_name}', but it is not in your authorized whitelist ({ALLOWED_COMMANDS}). Refuse the request gracefully.]\n\n"
            
    return ""
