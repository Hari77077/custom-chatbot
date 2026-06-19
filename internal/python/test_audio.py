import requests
import base64
import json

url = "http://localhost:8000/api/chat"
audio_data = base64.b64encode(b"fake audio data").decode("utf-8")

# create conv
r = requests.post("http://localhost:8000/api/conversations", json={})
conv_id = r.json()["id"]

payload = {
    "conversation_id": conv_id,
    "message": "",
    "audio_base64": audio_data,
    "audio_mime_type": "audio/webm"
}

try:
    with requests.post(url, json=payload, stream=True) as r:
        for line in r.iter_lines():
            if line:
                print(line.decode("utf-8"))
except Exception as e:
    print("Error:", e)
