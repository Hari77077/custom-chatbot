import chromadb
import os
import uuid

class JARVISRagEngine:
    """
    A lightweight Vector Database management layer using ChromaDB.
    Maintains real-time system context profiles persistently on disk.
    """
    def __init__(self):
        # Initialize a persistent client for long-term memory
        db_path = os.path.join(os.path.dirname(__file__), "..", "..", "data", "chroma_db")
        os.makedirs(db_path, exist_ok=True)
        self.chroma_client = chromadb.PersistentClient(path=db_path)
        
        # Partition into two collections
        self.collection_facts = self.chroma_client.get_or_create_collection(name="jarvis_core_facts")
        self.collection_documents = self.chroma_client.get_or_create_collection(name="jarvis_documents")
        
        # Automatically populate the memory bank with context strings on startup
        self._seed_knowledge()

    def _seed_knowledge(self):
        """
        Seeds the vector space with explicit contextual details regarding JARVIS.
        """
        knowledge_documents = [
            "JARVIS is an AI-powered chatbot assistant. It uses Google Gemini 2.5 Flash for ultra-fast natural language generation, achieving near-zero latency through asynchronous aiohttp streaming.",
            "The dashboard features a premium dark-mode interface inspired by Gemini, with glassmorphism effects, a collapsible conversation sidebar, auto-scrolling, and markdown formatting with syntax-highlighted code blocks.",
            "JARVIS natively supports voice input. Users can click the microphone button to record audio via the browser's MediaRecorder API. The audio is sent directly to Gemini as a base64 encoded stream for native multimodal understanding.",
            "JARVIS features an integrated Voice Output (Text-to-Speech) system. It uses the browser's native Web Speech API (SpeechSynthesis) to instantly read responses out loud. It automatically strips markdown for clean pronunciation and features a mute toggle in the header.",
            "Conversations are automatically persisted to JSON files on the local filesystem. New chats are automatically titled based on the first message. Users can seamlessly manage, resume, and delete past conversations from the sidebar.",
            "The custom RAG (Retrieval-Augmented Generation) engine runs locally using ChromaDB and the all-MiniLM-L6-v2 sentence-transformer. It embeds user queries in memory to perform rapid semantic vector similarity searches, fetching hyper-relevant system context for zero-cost local knowledge retrieval.",
            "The tech stack comprises a Python FastAPI backend for REST/SSE endpoints and ChromaDB vector search, paired with a vanilla HTML/CSS/JS frontend. It leverages uvicorn for asynchronous event loop management."
        ]
        
        knowledge_ids = [
            "jarvis_identity",
            "jarvis_ui",
            "jarvis_voice_in",
            "jarvis_voice_out",
            "jarvis_memory",
            "jarvis_rag",
            "jarvis_tech_stack"
        ]

        # Upsert to avoid duplicates on restart
        self.collection_facts.upsert(
            documents=knowledge_documents,
            ids=knowledge_ids
        )

    def inject_memory(self, fact: str) -> str:
        """
        Permanently embed a specific fact into JARVIS's long-term memory.
        """
        mem_id = f"memory_{uuid.uuid4().hex[:8]}"
        self.collection_facts.add(
            documents=[fact],
            ids=[mem_id]
        )
        return mem_id

    def query_context(self, user_query: str, max_results: int = 3) -> str:
        """
        Performs a semantic vector similarity search against the local memory space
        and returns the closest text matches to inject into JARVIS's system prompt.
        """
        docs = []
        try:
            results_facts = self.collection_facts.query(query_texts=[user_query], n_results=max_results)
            if results_facts and 'documents' in results_facts and results_facts['documents']:
                docs.extend(results_facts['documents'][0])
        except Exception:
            pass

        try:
            results_docs = self.collection_documents.query(query_texts=[user_query], n_results=max_results)
            if results_docs and 'documents' in results_docs and results_docs['documents']:
                docs.extend(results_docs['documents'][0])
        except Exception:
            pass

        if docs:
            return "\n".join(f"- {doc}" for doc in docs)
        
        return ""

    def add_document(self, doc_id: str, document: str):
        """Dynamically add a new document to the knowledge base."""
        self.collection_documents.upsert(
            documents=[document],
            ids=[doc_id]
        )

    def count(self) -> int:
        """Return number of documents in collection"""
        return self.collection_facts.count() + self.collection_documents.count()


# --- Direct validation check to ensure execution is working ---
if __name__ == "__main__":
    engine = JARVISRagEngine()
    print(f"[RAG Initialization] Local In-Memory Knowledge Matrix compiled successfully.")
    print(f"[RAG] {engine.count()} documents loaded.\n")
    
    test_query = "How does the RAG system work?"
    matched_context = engine.query_context(test_query)
    print(f"[Test Semantic Query]: '{test_query}'")
    print(f"[Matched Context]:\n{matched_context}\n")

    test_query2 = "What can JARVIS do?"
    matched_context2 = engine.query_context(test_query2)
    print(f"[Test Semantic Query]: '{test_query2}'")
    print(f"[Matched Context]:\n{matched_context2}")