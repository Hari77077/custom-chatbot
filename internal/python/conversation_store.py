"""
JSON file-based conversation persistence for JARVIS.
Each conversation is stored as a separate JSON file in the data directory.
"""
import json
import uuid
from pathlib import Path
from datetime import datetime
from typing import Optional


class ConversationStore:
    def __init__(self, storage_dir):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _get_path(self, conv_id: str) -> Path:
        return self.storage_dir / f"{conv_id}.json"

    def _save(self, conv_id: str, data: dict):
        data["updated_at"] = datetime.now().isoformat()
        with open(self._get_path(conv_id), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    def _load(self, conv_id: str) -> Optional[dict]:
        path = self._get_path(conv_id)
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def create_conversation(self, title: Optional[str] = None) -> dict:
        conv_id = str(uuid.uuid4())[:8]
        now = datetime.now().isoformat()
        data = {
            "id": conv_id,
            "title": title or "New conversation",
            "created_at": now,
            "updated_at": now,
            "messages": []
        }
        self._save(conv_id, data)
        return data

    def get_conversation(self, conv_id: str) -> Optional[dict]:
        return self._load(conv_id)

    def list_conversations(self) -> list:
        conversations = []
        for path in self.storage_dir.glob("*.json"):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                conversations.append({
                    "id": data["id"],
                    "title": data.get("title", "Untitled"),
                    "created_at": data.get("created_at", ""),
                    "updated_at": data.get("updated_at", ""),
                    "message_count": len(data.get("messages", []))
                })
            except (json.JSONDecodeError, KeyError):
                continue
        conversations.sort(key=lambda x: x.get("updated_at", ""), reverse=True)
        return conversations

    def add_message(self, conv_id: str, role: str, content: str) -> Optional[dict]:
        data = self._load(conv_id)
        if not data:
            return None
        now = datetime.now().isoformat()
        data["messages"].append({
            "role": role,
            "content": content,
            "timestamp": now
        })
        self._save(conv_id, data)
        
        # Log to timestamp.txt
        log_path = self.storage_dir.parent / "timestamp.txt"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{now}] Conversation {conv_id} | {role.upper()}: {content[:100]}...\n")
            
        return data

    def delete_conversation(self, conv_id: str) -> bool:
        path = self._get_path(conv_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def rename_conversation(self, conv_id: str, title: str) -> Optional[dict]:
        data = self._load(conv_id)
        if not data:
            return None
        data["title"] = title
        self._save(conv_id, data)
        return data
