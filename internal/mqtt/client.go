package mqtt

import (
	"chatbot/internal/api"
	"chatbot/internal/utils"
	"encoding/json"
	"fmt"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

func InitializeMQTT(broker string, clientID string) (mqtt.Client, error) {
	opts := mqtt.NewClientOptions().AddBroker(broker).SetClientID(clientID)

	opts.OnConnect = func(c mqtt.Client) {
		utils.LogInfo("Successfully pinned connection to Mosquitto MQTT Broker.")

		// Subscribe to telemetry topic
		token := c.Subscribe("nodes/telemetry", 1, handleIncomingTelemetry)
		token.Wait()
		utils.LogInfo("Subscribed to edge channel: nodes/telemetry")
	}

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return nil, token.Error()
	}
	return client, nil
}

func handleIncomingTelemetry(client mqtt.Client, msg mqtt.Message) {
	var payload api.TelemetryPayload
	if err := json.Unmarshal(msg.Payload(), &payload); err != nil {
		utils.LogError(fmt.Sprintf("Failed parsing delta packet payload: %v", err))
		return
	}

	utils.LogInfo(fmt.Sprintf("[MQTT Ingest] Delta triggered on Node: %s", payload.NodeID))
	// Feed directly into our high-speed dashboard and analysis pipeline
	api.BroadcastChannel <- payload
}
