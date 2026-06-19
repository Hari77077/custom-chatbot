# JARVIS Core Engine

JARVIS is a highly autonomous, multi-modal artificial intelligence assistant running on a local hybrid architecture (Python and Go). It leverages Google's Gemini 2.5 Flash neural network for core reasoning, combined with a custom agentic interception layer for real-world interactions.

## Key Capabilities

### 1. Multi-Modal Interface
JARVIS supports text, voice, and image inputs. The frontend implements a Walkie-Talkie interface featuring Voice Activity Detection (VAD). When recording audio, the system monitors microphone volume; after precisely 3 seconds of silence, the engine automatically terminates the recording and dispatches the raw audio byte stream directly to the neural network for near-instantaneous multimodal processing.

### 2. Native Search Grounding
Instead of relying on rigid, keyword-based web scraping scripts, JARVIS natively integrates with Google Search APIs. When asked for real-time information, the model autonomously queries live internet data to ground its responses, working seamlessly across both text and voice interactions.

### 3. Agentic Operating System Control
A Python-based interception layer acts as an active intermediary before inputs reach the LLM. It parses natural language to execute authorized system-level commands, such as launching designated applications (e.g., calculator, web browsers, or text editors), drafting emails via native clients, and generating standard calendar (.ics) invites.

### 4. Local Document Intelligence (RAG)
Users can upload text, markdown, or PDF documents directly into the interface. These documents are instantly vectorized and stored in a persistent local database (ChromaDB). This Retrieval-Augmented Generation (RAG) pipeline allows JARVIS to reference vast quantities of local context that exceed standard token windows.

### 5. Persistent Long-Term Memory
Beyond standard conversation history, JARVIS utilizes a partitioned ChromaDB implementation for permanent fact storage. Users can explicitly command the assistant to memorize specific facts, which are injected into a dedicated `jarvis_core_facts` vector space. These facts are retrieved and injected into the system prompt across all future sessions.

## Architecture

*   **Frontend**: Vanilla HTML/JS/CSS featuring Web MediaRecorder APIs and Web Speech Recognition for wake-word activation.
*   **AI Backend (Python)**: A FastAPI server handling asynchronous chunked generation, context window management, and Python-level tool interception.
*   **IoT/Core Backend (Go)**: A lightweight Golang server utilizing Eclipse Mosquitto (MQTT) for background system telemetry and external sensor integration.
*   **Database**: Persistent ChromaDB (`/data/chroma_db`) for vector embeddings, and JSON datastores (`/data/conversations`) for conversation state logging.

## Setup & Execution

A `Makefile` is provided for standard execution environments.

1.  **Environment Setup**: Copy `.env.example` to `.env` and provide a valid `GEMINI_API_KEY`.
2.  **Dependencies**: Run `make setup` to install Python packages and Go modules.
3.  **Execution**: 
    *   Run `make run-python` to boot the AI backend.
    *   Run `make run-go` to boot the background MQTT engine.

## Security Notice

The agentic system control layer runs shell commands. Only authorized commands explicitly defined in the `ALLOWED_COMMANDS` whitelist within `tools.py` will be permitted execution.
