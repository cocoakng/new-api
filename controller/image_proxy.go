package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
)

const imageProxyKeyPrefix = "img_proxy:"
const imageProxyTTL = 24 * time.Hour

func imageProxyError(c *gin.Context, status int, errType, message string) {
	c.JSON(status, gin.H{
		"error": gin.H{
			"message": message,
			"type":    errType,
		},
	})
}

// CacheImageURL stores an upstream image URL in Redis and returns a short proxy ID.
func CacheImageURL(upstreamURL string) (string, error) {
	id := "img_" + common.GetUUID()
	key := imageProxyKeyPrefix + id
	if err := common.RedisSet(key, upstreamURL, imageProxyTTL); err != nil {
		return "", fmt.Errorf("failed to cache image URL: %w", err)
	}
	return id, nil
}

// ImageProxy proxies an upstream image URL without exposing it to the client.
func ImageProxy(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		imageProxyError(c, http.StatusBadRequest, "invalid_request_error", "image id is required")
		return
	}

	key := imageProxyKeyPrefix + id
	upstreamURL, err := common.RedisGet(key)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("Failed to get cached image URL for id %s: %s", id, err.Error()))
		imageProxyError(c, http.StatusNotFound, "invalid_request_error", "Image not found or expired")
		return
	}

	upstreamURL = strings.TrimSpace(upstreamURL)
	if upstreamURL == "" {
		logger.LogError(c, fmt.Sprintf("Cached image URL is empty for id %s", id))
		imageProxyError(c, http.StatusBadGateway, "server_error", "Image URL is empty")
		return
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(
		upstreamURL,
		fetchSetting.EnableSSRFProtection,
		fetchSetting.AllowPrivateIp,
		fetchSetting.DomainFilterMode,
		fetchSetting.IpFilterMode,
		fetchSetting.DomainList,
		fetchSetting.IpList,
		fetchSetting.AllowedPorts,
		fetchSetting.ApplyIPFilterForDomain,
	); err != nil {
		logger.LogError(c, fmt.Sprintf("Image URL blocked for id %s: %v", id, err))
		imageProxyError(c, http.StatusForbidden, "server_error", fmt.Sprintf("request blocked: %v", err))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, upstreamURL, nil)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("Failed to create request for id %s: %s", id, err.Error()))
		imageProxyError(c, http.StatusInternalServerError, "server_error", "Failed to create proxy request")
		return
	}
	req.Header.Set("User-Agent", "Mozilla/5.0")

	client := &http.Client{
		Timeout: 60 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			redirectURL := req.URL.String()
			return common.ValidateURLWithFetchSetting(
				redirectURL,
				fetchSetting.EnableSSRFProtection,
				fetchSetting.AllowPrivateIp,
				fetchSetting.DomainFilterMode,
				fetchSetting.IpFilterMode,
				fetchSetting.DomainList,
				fetchSetting.IpList,
				fetchSetting.AllowedPorts,
				fetchSetting.ApplyIPFilterForDomain,
			)
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("Failed to fetch image from %s: %s", upstreamURL, err.Error()))
		imageProxyError(c, http.StatusBadGateway, "server_error", "Failed to fetch image")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		logger.LogError(c, fmt.Sprintf("Upstream returned status %d for %s", resp.StatusCode, upstreamURL))
		imageProxyError(c, http.StatusBadGateway, "server_error",
			fmt.Sprintf("Upstream service returned status %d", resp.StatusCode))
		return
	}

	// Copy upstream headers (exclude CORS headers)
	skipHeaders := map[string]bool{
		"access-control-allow-origin":      true,
		"access-control-allow-methods":     true,
		"access-control-allow-headers":     true,
		"access-control-allow-credentials": true,
		"access-control-max-age":           true,
	}
	for key, values := range resp.Header {
		if skipHeaders[strings.ToLower(key)] {
			continue
		}
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	c.Writer.Header().Set("Cache-Control", "public, max-age=86400")
	c.Writer.WriteHeader(resp.StatusCode)
	if _, err = io.Copy(c.Writer, resp.Body); err != nil {
		logger.LogError(c, fmt.Sprintf("Failed to stream image content: %s", err.Error()))
	}
}

// ReplaceImageURLInJSON replaces upstream image URLs in a JSON response body with proxy URLs.
// It parses the JSON, finds the "url" field in the "data" array, replaces it with a cached proxy URL,
// and re-marshals the result.
func ReplaceImageURLInJSON(body []byte) ([]byte, error) {
	var parsed struct {
		Data []struct {
			Url           string `json:"url,omitempty"`
			B64Json       string `json:"b64_json,omitempty"`
			RevisedPrompt string `json:"revised_prompt,omitempty"`
		} `json:"data,omitempty"`
		Created int64           `json:"created,omitempty"`
		Usage   json.RawMessage `json:"usage,omitempty"`
		Meta    json.RawMessage `json:"metadata,omitempty"`
	}

	if err := common.Unmarshal(body, &parsed); err != nil {
		return body, nil // If parsing fails, return original body
	}

	for i := range parsed.Data {
		if parsed.Data[i].Url != "" {
			id, err := CacheImageURL(parsed.Data[i].Url)
			if err != nil {
				logger.LogError(context.Background(), fmt.Sprintf("Failed to cache image URL: %v", err))
				continue
			}
			parsed.Data[i].Url = "/v1/images/proxy/" + id
		}
	}

	return common.Marshal(parsed)
}
