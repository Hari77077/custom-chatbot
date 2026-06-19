package main

import (
	"chatbot/internal/api"
	"chatbot/internal/mqtt"
	"chatbot/internal/utils"
	"fmt"
	"log"
	"net/http"
)

func main() {
	utils.LogInfo("Starting JARVIS Core Engine Backend...")

	// 1. Initialize the MQTT client to listen for edge ESP32 delta updates
	mqttClient, err := mqtt.InitializeMQTT("tcp://localhost:1883", "jarvis_go_core")
	if err != nil {
		log.Fatalf("Failed to initialize MQTT broker connection: %v", err)
	}
	defer mqttClient.Disconnect(250)

	// 2. Set up the Dashboard WebSocket handler loop
	http.HandleFunc("/ws", api.HandleDashboardConnections)

	// 3. Keep track of incoming broadcasts from Go routine pipelines
	go api.StartBroadcastPipeline()

	serverAddr := ":8080"
	utils.LogInfo(fmt.Sprintf("Go Backend fully operational. Listening on %s...", serverAddr))
	if err := http.ListenAndServe(serverAddr, nil); err != nil {
		log.Fatalf("Server shutdown unexpectedly: %v", err)
	}
}
