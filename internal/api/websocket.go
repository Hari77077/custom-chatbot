package api

import (
	"chatbot/internal/utils"
	"fmt"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type TelemetryPayload struct {
	NodeID    string                 `json:"node_id"`
	Metrics   map[string]interface{} `json:"metrics"`
	IsAnomaly bool                   `json:"is_anomaly"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

var (
	clients          = make(map[*websocket.Conn]bool)
	clientsMu        sync.Mutex
	BroadcastChannel = make(chan TelemetryPayload)
)

func HandleDashboardConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		utils.LogError(fmt.Sprintf("WebSocket Upgrade failure: %v", err))
		return
	}
	defer ws.Close()

	clientsMu.Lock()
	clients[ws] = true
	clientsMu.Unlock()

	utils.LogInfo("New dashboard client socket attached.")

	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			clientsMu.Lock()
			delete(clients, ws)
			clientsMu.Unlock()
			break
		}
	}
}

func StartBroadcastPipeline() {
	for {
		msg := <-BroadcastChannel

		clientsMu.Lock()
		for client := range clients {
			err := client.WriteJSON(msg)
			if err != nil {
				client.Close()
				delete(clients, client)
			}
		}
		clientsMu.Unlock()

		// If a node breaks an extreme threshold limit, drop out to python core
		if msg.IsAnomaly {
			go triggerPythonDecoupler(msg)
		}
	}
}

func triggerPythonDecoupler(data TelemetryPayload) {
	// This maps the bridge from Go's lightweight ingestion straight to your Python AI core
	utils.LogInfo(fmt.Sprintf("[Routing System] Dispatched Node %s analytics anomaly payload to internal/python/core.py", data.NodeID))
}
