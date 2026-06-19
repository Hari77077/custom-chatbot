"""
JARVIS Chat Server — FastAPI backend with Gemini AI, RAG context injection,
audio input support, and conversation persistence.
"""
import os
import sys
import json
import base64
import asyncio
import edge_tts
import io
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from google import genai
from google.genai import types

from rag_engine import JARVISRagEngine
import tools
from conversation_store import ConversationStore

# Load environment from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
load_dotenv(PROJECT_ROOT / ".env")

app = FastAPI(title="JARVIS Chat Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
rag_engine = JARVISRagEngine()
conv_store = ConversationStore(PROJECT_ROOT / "data" / "conversations")

# Initialize Gemini client
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("[FATAL] GEMINI_API_KEY not found in .env file!")
    sys.exit(1)

gemini_client = genai.Client(api_key=api_key)
MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = """You are JARVIS, an advanced AI chatbot assistant.
You are knowledgeable, helpful, and versatile — capable of answering questions on a wide
range of topics including programming, science, writing, analysis, and general knowledge.

You speak in a professional yet friendly tone. You use markdown formatting for clarity.

Guidelines:
- Be concise but thorough
- Use **bold** for emphasis, `code` for technical terms, and code blocks for examples
- Structure complex answers with headers, lists, and clear explanations
- If you receive audio input, listen carefully and respond naturally
- When you have relevant context from the knowledge base, use it to enhance your answers
- IMPORTANT: You have native Google Search capabilities enabled. YOU MUST autonomously use Google Search to fetch live information whenever the user asks for real-time data, current events, weather, or the current date and time! NEVER say you don't have access to real-time data.
- If the user asks you to open a computer application (like calculator, notepad, chrome, cmd), you MUST include the exact string `[OPEN_APP: app_name]` anywhere in your response. For example: `[OPEN_APP: calc]`. I will intercept this tag and open it for them.
{rag_context}"""


# --- Request Models ---

class ChatRequest(BaseModel):
    conversation_id: str
    message: str = ""
    audio_base64: Optional[str] = None
    audio_mime_type: Optional[str] = "audio/webm"
    image_base64: Optional[str] = None
    image_mime_type: Optional[str] = None


class ConversationCreate(BaseModel):
    title: Optional[str] = None


class ConversationRename(BaseModel):
    title: str

class TTSRequest(BaseModel):
    text: str

# --- Conversation API ---

@app.get("/api/conversations")
async def list_conversations():
    return {"conversations": conv_store.list_conversations()}


@app.post("/api/conversations")
async def create_conversation(data: ConversationCreate = ConversationCreate()):
    return conv_store.create_conversation(data.title)


@app.get("/api/conversations/{conv_id}")
async def get_conversation(conv_id: str):
    conv = conv_store.get_conversation(conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@app.delete("/api/conversations/{conv_id}")
async def delete_conversation(conv_id: str):
    if not conv_store.delete_conversation(conv_id):
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}


@app.patch("/api/conversations/{conv_id}")
async def rename_conversation(conv_id: str, data: ConversationRename):
    conv = conv_store.rename_conversation(conv_id, data.title)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


# --- Chat API with Streaming ---

@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Send a message (text or audio) and receive a streaming Gemini response."""
    conv = conv_store.get_conversation(request.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # RAG context retrieval
    query_text = request.message if request.message else "audio message about the system"
    
    # Agentic Tool Execution
    agentic_context = tools.execute_agentic_tools(query_text, rag_engine=rag_engine)
    
    retrieved = rag_engine.query_context(query_text, max_results=3)
    rag_context = agentic_context
    if retrieved and "No matching" not in retrieved and "exception" not in retrieved.lower():
        rag_context += f"\n\nRelevant system context for this query:\n{retrieved}"

    system_instruction = SYSTEM_PROMPT.format(rag_context=rag_context)

    # Build conversation history
    contents = []
    for msg in conv.get("messages", [])[-20:]:  # Last 20 messages for context window
        role = "user" if msg["role"] == "user" else "model"
        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=msg["content"])])
        )

    # Build current message parts
    # Build current message parts
    current_parts = []
    
    if request.image_base64:
        image_bytes = base64.b64decode(request.image_base64)
        clean_image_mime = request.image_mime_type.split(';')[0] if request.image_mime_type else "image/jpeg"
        current_parts.append(
            types.Part.from_bytes(data=image_bytes, mime_type=clean_image_mime)
        )
        
    if request.audio_base64:
        audio_bytes = base64.b64decode(request.audio_base64)
        clean_mime_type = request.audio_mime_type.split(';')[0]
        current_parts.append(
            types.Part.from_bytes(data=audio_bytes, mime_type=clean_mime_type)
        )

    if request.message:
        current_parts.append(types.Part.from_text(text=request.message))
    elif not request.message and not current_parts:
        current_parts.append(types.Part.from_text(text="Hello"))

    contents.append(types.Content(role="user", parts=current_parts))

    # Save user message
    display_msg = request.message
    if not display_msg:
        if request.audio_base64:
            display_msg = "🎤 Voice message"
        elif request.image_base64:
            display_msg = "🖼️ Image attachment"
        else:
            display_msg = "Attached media"
    conv_store.add_message(request.conversation_id, "user", display_msg)

    # Auto-title on first message
    if len(conv.get("messages", [])) == 0:
        title = display_msg[:50] + ("..." if len(display_msg) > 50 else "")
        conv_store.rename_conversation(request.conversation_id, title)

    async def generate_stream():
        full_response = ""
        try:
            response = await gemini_client.aio.models.generate_content_stream(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    temperature=0.7,
                    max_output_tokens=8192,
                    tools=[{"google_search": {}}]
                )
            )
            async for chunk in response:
                if chunk.text:
                    full_response += chunk.text
                    yield f"data: {json.dumps({'text': chunk.text})}\n\n"
        except Exception as e:
            e_str = str(e)
            if "429" in e_str or "Too Many Requests" in e_str:
                error_msg = "Google Gemini Rate Limit Exceeded (429). You have used up your free tier API quota for this minute. Please wait a few seconds and try again."
            else:
                error_msg = f"I encountered an error: {e_str}"
            yield f"data: {json.dumps({'error': error_msg})}\n\n"
            full_response = error_msg

        # Save assistant response
        if full_response:
            conv_store.add_message(request.conversation_id, "assistant", full_response)
            
            # Intercept [OPEN_APP: ] for Voice Commands
            import re
            import subprocess
            from tools import ALLOWED_COMMANDS
            match = re.search(r"\[OPEN_APP:\s*([^\]]+)\]", full_response, re.IGNORECASE)
            if match:
                app_name = match.group(1).strip().lower()
                if app_name == "calculator": app_name = "calc"
                if app_name in ALLOWED_COMMANDS:
                    try:
                        subprocess.Popen(app_name, shell=True)
                    except Exception as e:
                        print(f"Failed to open app {app_name}: {e}")
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(generate_stream(), media_type="text/event-stream")


@app.post("/api/tts")
async def generate_tts(request: TTSRequest):
    """Generates premium neural audio via edge-tts."""
    text = request.text
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
        
    async def audio_generator():
        communicate = edge_tts.Communicate(text, "en-GB-RyanNeural", rate="-5%")
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]
                
    return StreamingResponse(audio_generator(), media_type="audio/mpeg")


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)):
    """Extract text from uploaded TXT or PDF files and inject into local RAG memory."""
    try:
        content = await file.read()
        extracted_text = ""
        
        if file.filename.lower().endswith('.pdf'):
            import PyPDF2
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
        else:
            extracted_text = content.decode('utf-8', errors='ignore')
            
        if not extracted_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from file")
            
        # Chunk the text to avoid massive vector embeddings
        chunk_size = 1000
        chunks = [extracted_text[i:i+chunk_size] for i in range(0, len(extracted_text), chunk_size)]
        
        # Add to RAG
        for i, chunk in enumerate(chunks):
            doc_id = f"{file.filename}_chunk_{i}_{int(datetime.now().timestamp())}"
            rag_engine.add_document(doc_id, chunk)
            
        return {"status": "success", "chunks_added": len(chunks), "filename": file.filename}
    except Exception as e:
        print(f"Error processing document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Static file serving for dashboard ---

DASHBOARD_DIR = PROJECT_ROOT / "dashboard"


@app.get("/")
async def serve_dashboard():
    return FileResponse(DASHBOARD_DIR / "index.html")


app.mount("/static", StaticFiles(directory=str(DASHBOARD_DIR)), name="dashboard")


if __name__ == "__main__":
    import uvicorn
    print("=" * 55)
    print("  JARVIS Chat Server")
    print("=" * 55)
    print(f"  Dashboard:  http://localhost:8000")
    print(f"  API:        http://localhost:8000/api")
    print(f"  RAG Docs:   {rag_engine.count()} loaded")
    print("=" * 55)
    uvicorn.run(app, host="0.0.0.0", port=8000)
