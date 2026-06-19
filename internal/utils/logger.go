package utils

import (
	"fmt"
	"time"
)

func LogInfo(message string) {
	fmt.Printf("[%s] [INFO] %s\n", time.Now().Format("15:04:05"), message)
}

func LogError(message string) {
	fmt.Printf("[%s] [ERROR] \033[31m%s\033[0m\n", time.Now().Format("15:04:05"), message)
}
