package service

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestGPTImage2SSEFormatParsing verifies that the gpt-image-2 SSE result
// event format can be correctly parsed and its "data" array is accessible.
// This is the struct shape used in ReplaceImageURLInResponseStream.
func TestGPTImage2SSEFormatParsing(t *testing.T) {
	// gpt-image-2 SSE result event
	input := `{"object":"image.generation.result","created":1783475426,"model":"gpt-image-2","index":1,"total":1,"data":[{"url":"https://img.sulmes.com/images/2026/07/08/test.png","b64_json":"xxx","revised_prompt":"test"}]}`

	var parsed struct {
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

	err := common.Unmarshal([]byte(input), &parsed)
	require.NoError(t, err)
	require.Len(t, parsed.Data, 1)
	assert.Equal(t, "https://img.sulmes.com/images/2026/07/08/test.png", parsed.Data[0].Url)
	assert.Equal(t, "xxx", parsed.Data[0].B64Json)
	assert.Equal(t, "test", parsed.Data[0].RevisedPrompt)
	assert.Equal(t, "image.generation.result", parsed.Object)
	assert.Equal(t, "gpt-image-2", parsed.Model)

	// Simulate URL replacement logic (without Redis)
	parsed.Data[0].Url = "/v1/images/proxy/img_test123"
	result, err := common.Marshal(parsed)
	require.NoError(t, err)
	assert.Contains(t, string(result), `"/v1/images/proxy/img_test123"`)
	assert.NotContains(t, string(result), "img.sulmes.com")
	assert.Contains(t, string(result), `"b64_json":"xxx"`)
	assert.Contains(t, string(result), `"object":"image.generation.result"`)
}

func TestGPTImage2SSEChunkFormat(t *testing.T) {
	// gpt-image-2 SSE chunk events with empty data array
	input := `{"object":"image.generation.chunk","created":1783475398,"model":"gpt-image-2","index":1,"total":1,"data":[]}`

	var parsed struct {
		Data []struct {
			Url string `json:"url,omitempty"`
		} `json:"data,omitempty"`
		Object string `json:"object,omitempty"`
	}

	err := common.Unmarshal([]byte(input), &parsed)
	require.NoError(t, err)
	assert.Empty(t, parsed.Data, "chunk events should have empty data array")
	assert.Equal(t, "image.generation.chunk", parsed.Object)
}

func TestFlatSSEFormatParsing(t *testing.T) {
	// Original flat SSE format
	input := `{"type":"image_generation.completed","url":"https://example.com/img.png","b64_json":"yyy"}`

	var parsed struct {
		Url           string `json:"url,omitempty"`
		B64Json       string `json:"b64_json,omitempty"`
		RevisedPrompt string `json:"revised_prompt,omitempty"`
		Type          string `json:"type,omitempty"`
	}

	err := common.Unmarshal([]byte(input), &parsed)
	require.NoError(t, err)
	assert.Equal(t, "https://example.com/img.png", parsed.Url)
	assert.Equal(t, "image_generation.completed", parsed.Type)
	assert.Equal(t, "yyy", parsed.B64Json)
}

// TestReplaceImageURLInResponseStream_NoURL tests that events without URLs
// are returned unchanged.
func TestReplaceImageURLInResponseStream_NoURL(t *testing.T) {
	input := `{"type":"usage","prompt_tokens":3,"completion_tokens":4}`
	result := ReplaceImageURLInResponseStream([]byte(input))
	assert.Equal(t, input, string(result), "No URL field should return unchanged")
}

// TestReplaceImageURLInResponseStream_EmptyDataArray tests that events with
// an empty data array are returned unchanged.
func TestReplaceImageURLInResponseStream_EmptyDataArray(t *testing.T) {
	input := `{"object":"image.generation.chunk","created":1783475398,"model":"gpt-image-2","index":1,"total":1,"data":[]}`
	result := ReplaceImageURLInResponseStream([]byte(input))
	assert.Equal(t, input, string(result), "Empty data array should return unchanged")
}
