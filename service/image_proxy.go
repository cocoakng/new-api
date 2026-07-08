package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
)

const imageProxyKeyPrefix = "img_proxy:"
const imageProxyTTL = 24 * time.Hour

// CacheImageURL stores an upstream image URL in Redis and returns a short proxy ID.
func CacheImageURL(upstreamURL string) (string, error) {
	id := "img_" + common.GetUUID()
	key := imageProxyKeyPrefix + id
	if err := common.RedisSet(key, upstreamURL, imageProxyTTL); err != nil {
		return "", fmt.Errorf("failed to cache image URL: %w", err)
	}
	return id, nil
}

// ReplaceImageURLInResponse parses an image API response JSON, replaces upstream
// image URLs with cached proxy URLs, and returns the modified JSON.
// If parsing fails, the original body is returned unchanged.
func ReplaceImageURLInResponse(body []byte) ([]byte, error) {
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
		return body, nil
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

// ReplaceImageURLInResponseStream handles SSE stream data chunks.
// It looks for JSON objects with a "url" field and replaces upstream URLs
// with proxy URLs. It also handles the OpenAI image streaming format where
// the "data" array contains image objects with "url" fields.
// If the data is not a valid JSON object or has no url field,
// it returns the original data unchanged.
func ReplaceImageURLInResponseStream(data []byte) []byte {
	// Try the array-based format first (e.g., gpt-image-2 SSE events):
	// {"object": "image.generation.result", "data": [{"url": "..."}]}
	var arrayParsed struct {
		Data []struct {
			Url           string `json:"url,omitempty"`
			B64Json       string `json:"b64_json,omitempty"`
			RevisedPrompt string `json:"revised_prompt,omitempty"`
		} `json:"data,omitempty"`
		Object       string          `json:"object,omitempty"`
		Created      int64           `json:"created,omitempty"`
		Model        string          `json:"model,omitempty"`
		Index        int             `json:"index,omitempty"`
		Total        int             `json:"total,omitempty"`
		ProgressText string          `json:"progress_text,omitempty"`
		Usage        json.RawMessage `json:"usage,omitempty"`
	}

	if err := common.Unmarshal(data, &arrayParsed); err == nil && len(arrayParsed.Data) > 0 {
		hasChanges := false
		for i := range arrayParsed.Data {
			if arrayParsed.Data[i].Url != "" {
				id, err := CacheImageURL(arrayParsed.Data[i].Url)
				if err != nil {
					logger.LogError(context.Background(), fmt.Sprintf("Failed to cache image URL: %v", err))
					continue
				}
				arrayParsed.Data[i].Url = "/v1/images/proxy/" + id
				hasChanges = true
			}
		}
		if hasChanges {
			result, err := common.Marshal(arrayParsed)
			if err == nil {
				return result
			}
		}
		return data
	}

	// Fall back to flat format: {"url": "...", "type": "..."}
	var flatParsed struct {
		Url           string          `json:"url,omitempty"`
		B64Json       string          `json:"b64_json,omitempty"`
		RevisedPrompt string          `json:"revised_prompt,omitempty"`
		Type          string          `json:"type,omitempty"`
		CreatedAt     int64           `json:"created_at,omitempty"`
		Usage         json.RawMessage `json:"usage,omitempty"`
	}

	if err := common.Unmarshal(data, &flatParsed); err == nil {
		if flatParsed.Url != "" {
			id, err := CacheImageURL(flatParsed.Url)
			if err != nil {
				logger.LogError(context.Background(), fmt.Sprintf("Failed to cache image URL: %v", err))
				return data
			}
			flatParsed.Url = "/v1/images/proxy/" + id
			result, _ := common.Marshal(flatParsed)
			return result
		}
	}

	return data
}
