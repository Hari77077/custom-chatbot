.PHONY: setup run-python run-go docker-up docker-down clean

# Environment variables
PYTHON_APP = internal/python/chat_server.py
GO_APP = cmd/server/main.go

setup:
	@echo "Installing Python dependencies..."
	pip install -r internal/python/requirement.txt
	@echo "Downloading Go modules..."
	go mod tidy

run-python:
	@echo "Starting JARVIS AI Chat Server..."
	python $(PYTHON_APP)

run-go:
	@echo "Starting JARVIS MQTT Core Engine..."
	go run $(GO_APP)

docker-up:
	@echo "Starting Mosquitto MQTT Broker..."
	docker-compose up -d

docker-down:
	@echo "Stopping Mosquitto MQTT Broker..."
	docker-compose down

clean:
	@echo "Cleaning up temporary files..."
	rm -f *.mp3
	rm -f *.wav
	rm -f jarvis-core jarvis-core.exe
	find . -type d -name "__pycache__" -exec rm -rf {} +
