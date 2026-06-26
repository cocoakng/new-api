/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

package controller

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	_ "image/gif" // 注册 GIF 解码器
	_ "image/png" // 注册 PNG 解码器
)

// UploadImageRequest 上传图片请求
type UploadImageRequest struct {
	Image string `json:"image"` // base64 编码的图片（含 data:image/xxx;base64, 前缀）或纯 base64
}

// UploadImageResponse 上传图片响应
type UploadImageResponse struct {
	Url       string `json:"url"`        // 可访问的图片 URL
	Filename  string `json:"filename"`   // 文件名
	Size      int    `json:"size"`       // 图片大小（字节）
	Mime      string `json:"mime"`       // MIME 类型
	ExpiresAt string `json:"expires_at"` // 过期时间（如有）
}

// UploadImage 上传图片到 ImgBB，返回代理后的 URL
func UploadImage(c *gin.Context) {
	if setting.ImgBBApiKey == "" {
		common.ApiError(c, fmt.Errorf("image upload not configured: ImgBBApiKey is empty"))
		return
	}
	if setting.ImageBaseUrl == "" {
		common.ApiError(c, fmt.Errorf("image upload not configured: ImageBaseUrl is empty"))
		return
	}

	var imageData []byte
	var mime string
	var filename string

	contentType := c.GetHeader("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		// 处理文件上传
		file, header, err := c.Request.FormFile("image")
		if err != nil {
			// 尝试 "file" 字段
			file, header, err = c.Request.FormFile("file")
			if err != nil {
				common.ApiError(c, fmt.Errorf("missing image file: %w", err))
				return
			}
		}
		defer file.Close()

		// 验证 MIME 类型
		mime = header.Header.Get("Content-Type")
		if mime == "" {
			// 根据文件扩展名推断
			ext := strings.ToLower(header.Filename)
			if strings.HasSuffix(ext, ".png") {
				mime = "image/png"
			} else if strings.HasSuffix(ext, ".jpg") || strings.HasSuffix(ext, ".jpeg") {
				mime = "image/jpeg"
			} else if strings.HasSuffix(ext, ".webp") {
				mime = "image/webp"
			} else if strings.HasSuffix(ext, ".gif") {
				mime = "image/gif"
			} else {
				mime = "application/octet-stream"
			}
		}

		if !isAllowedMime(mime) {
			common.ApiError(c, fmt.Errorf("unsupported image type: %s, allowed: jpeg, png, webp, gif", mime))
			return
		}

		imageData, err = io.ReadAll(file)
		if err != nil {
			common.ApiError(c, fmt.Errorf("failed to read image: %w", err))
			return
		}

		filename = header.Filename

	} else {
		// 处理 JSON body（base64）
		var req UploadImageRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			common.ApiError(c, fmt.Errorf("invalid request: %w", err))
			return
		}

		if req.Image == "" {
			common.ApiError(c, fmt.Errorf("missing image data"))
			return
		}

		// 解析 base64
		base64Data := req.Image
		if idx := strings.Index(base64Data, ";base64,"); idx != -1 {
			mime = base64Data[5:idx] // 提取 "data:image/png" 中的 "image/png"
			base64Data = base64Data[idx+len(";base64,"):]
		}

		if !isAllowedMime(mime) {
			if mime == "" {
				mime = "image/png" // 默认
			} else {
				common.ApiError(c, fmt.Errorf("unsupported image type: %s", mime))
				return
			}
		}

		var err error
		imageData, err = base64.StdEncoding.DecodeString(base64Data)
		if err != nil {
			common.ApiError(c, fmt.Errorf("invalid base64 data: %w", err))
			return
		}

		filename = fmt.Sprintf("upload-%d.%s", time.Now().UnixMilli(), extFromMime(mime))
	}

	// 自动压缩：超过 10MB 的图片自动转为 JPEG 并降低质量
	if len(imageData) > 10*1024*1024 {
		compressed, err := compressImage(imageData, mime)
		if err != nil {
			common.ApiError(c, fmt.Errorf("failed to compress image: %w", err))
			return
		}
		imageData = compressed
		mime = "image/jpeg"
		filename = strings.TrimSuffix(filename, ".png") + ".jpg"
		filename = strings.TrimSuffix(filename, ".webp") + ".jpg"
		filename = strings.TrimSuffix(filename, ".gif") + ".jpg"
	}

	// 硬性限制：压缩后仍超过 20MB 则拒绝
	if len(imageData) > 20*1024*1024 {
		common.ApiError(c, fmt.Errorf("image too large after compression: %d bytes (max 20MB)", len(imageData)))
		return
	}

	// 上传到 ImgBB
	imgbbUrl, err := uploadToImgBB(imageData, filename, mime)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to upload image: %w", err))
		return
	}

	// 构造代理 URL
	// 从 ImgBB URL (https://i.ibb.co/xxx/filename.png) 提取路径部分
	proxyPath := extractImgbbPath(imgbbUrl)
	proxyUrl := strings.TrimRight(setting.ImageBaseUrl, "/") + "/" + proxyPath

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": UploadImageResponse{
			Url:      proxyUrl,
			Filename: filename,
			Size:     len(imageData),
			Mime:     mime,
		},
	})
}

// uploadToImgBB 上传图片到 ImgBB API
func uploadToImgBB(data []byte, filename string, mime string) (string, error) {
	// 构造 multipart 请求
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// API Key 字段
	keyField, err := writer.CreateFormField("key")
	if err != nil {
		return "", fmt.Errorf("create key field: %w", err)
	}
	keyField.Write([]byte(setting.ImgBBApiKey))

	// 图片文件字段
	part, err := writer.CreateFormFile("image", filename)
	if err != nil {
		return "", fmt.Errorf("create image field: %w", err)
	}
	part.Write(data)

	writer.Close()

	// 发送请求
	req, err := http.NewRequest("POST", setting.ImgBBApiUrl, &buf)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("imgbb returned %d: %s", resp.StatusCode, string(respBody))
	}

	// 解析响应
	var result struct {
		Success      bool   `json:"success"`
		Status       int    `json:"status"`
		Data         struct {
			ID         string `json:"id"`
			Title      string `json:"title"`
			URL        string `json:"url"`
			URLViewer  string `json:"url_viewer"`
			DisplayURL string `json:"display_url"`
			Image      struct {
				Filename string `json:"filename"`
				Mime     string `json:"mime"`
				URL      string `json:"url"`
			} `json:"image"`
		} `json:"data"`
		Error        string `json:"error"`
		StatusText   string `json:"status_txt"`
	}
	if err := common.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}

	if !result.Success {
		return "", fmt.Errorf("imgbb error: %s", result.Error)
	}

	// 返回直接图片 URL
	if result.Data.Image.URL != "" {
		return result.Data.Image.URL, nil
	}
	if result.Data.URL != "" {
		return result.Data.URL, nil
	}

	return "", fmt.Errorf("no URL in imgbb response")
}

// extractImgbbPath 从 ImgBB URL 提取路径部分
// https://i.ibb.co/5gZNVd5C/1-2.png → 5gZNVd5C/1-2.png
func extractImgbbPath(url string) string {
	// 去掉协议和域名
	url = strings.TrimPrefix(url, "https://")
	url = strings.TrimPrefix(url, "http://")

	// 去掉 i.ibb.co 前缀（如果有）
	if idx := strings.Index(url, "/"); idx != -1 {
		return url[idx+1:]
	}
	return url
}

// isAllowedMime 检查 MIME 类型是否允许
func isAllowedMime(mime string) bool {
	for _, allowed := range setting.AllowedMimes {
		if mime == allowed {
			return true
		}
	}
	// 兼容 jpeg 变体
	if mime == "image/jpg" {
		return true
	}
	return false
}

// extFromMime 从 MIME 类型获取扩展名
func extFromMime(mime string) string {
	switch mime {
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	default:
		return "png"
	}
}

// compressImage 自动压缩大图，优先保证画质
// 策略：先限制分辨率长边到 2048px + quality 85 → 逐步降 quality → 再缩分辨率
func compressImage(data []byte, originalMime string) ([]byte, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode image: %w", err)
	}

	// 第一步：如果长边 > 2048px，先缩放到 2048px（视频参考图不需要更高分辨率）
	img = limitDimension(img, 2048)

	// 第二步：从 quality 85 开始逐步降低，直到 ≤ 10MB
	for quality := 85; quality >= 60; quality -= 5 {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
			return nil, fmt.Errorf("encode jpeg: %w", err)
		}
		if buf.Len() <= 10*1024*1024 {
			return buf.Bytes(), nil
		}
	}

	// 第三步：quality 60 仍然太大，缩到长边 1024px + quality 70
	img = limitDimension(img, 1024)
	for quality := 70; quality >= 50; quality -= 5 {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality}); err != nil {
			return nil, fmt.Errorf("encode scaled jpeg: %w", err)
		}
		if buf.Len() <= 10*1024*1024 {
			return buf.Bytes(), nil
		}
	}

	return nil, fmt.Errorf("image too large even after compression")
}

// limitDimension 限制图片长边不超过 maxPx 像素
func limitDimension(img image.Image, maxPx int) image.Image {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	maxDim := w
	if h > w {
		maxDim = h
	}
	if maxDim <= maxPx {
		return img
	}
	scale := float64(maxPx) / float64(maxDim)
	newW := int(float64(w) * scale)
	newH := int(float64(h) * scale)
	return scaleImageBilinear(img, newW, newH)
}

// scaleImage 按比例缩放图片
func scaleImage(img image.Image, scale float64) image.Image {
	bounds := img.Bounds()
	w := int(float64(bounds.Dx()) * scale)
	h := int(float64(bounds.Dy()) * scale)
	scaled := image.NewRGBA(image.Rect(0, 0, w, h))

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			srcX := int(float64(x) / scale)
			srcY := int(float64(y) / scale)
			scaled.Set(x, y, img.At(srcX, srcY))
		}
	}
	return scaled
}

// scaleImageBilinear 双线性插值缩放（画质更好）
func scaleImageBilinear(img image.Image, newW, newH int) *image.RGBA {
	bounds := img.Bounds()
	oldW := bounds.Dx()
	oldH := bounds.Dy()
	scaled := image.NewRGBA(image.Rect(0, 0, newW, newH))

	for y := 0; y < newH; y++ {
		for x := 0; x < newW; x++ {
			fx := float64(x) * float64(oldW) / float64(newW)
			fy := float64(y) * float64(oldH) / float64(newH)
			x0 := int(fx)
			y0 := int(fy)
			x1 := min(x0+1, oldW-1)
			y1 := min(y0+1, oldH-1)
			wx := fx - float64(x0)
			wy := fy - float64(y0)

			c00 := img.At(x0, y0)
			c10 := img.At(x1, y0)
			c01 := img.At(x0, y1)
			c11 := img.At(x1, y1)

			r00, g00, b00, a00 := c00.RGBA()
			r10, g10, b10, a10 := c10.RGBA()
			r01, g01, b01, a01 := c01.RGBA()
			r11, g11, b11, a11 := c11.RGBA()

			r := uint8((float64(r00)*(1-wx)*(1-wy) + float64(r10)*wx*(1-wy) + float64(r01)*(1-wx)*wy + float64(r11)*wx*wy) / 0x101)
			g := uint8((float64(g00)*(1-wx)*(1-wy) + float64(g10)*wx*(1-wy) + float64(g01)*(1-wx)*wy + float64(g11)*wx*wy) / 0x101)
			b := uint8((float64(b00)*(1-wx)*(1-wy) + float64(b10)*wx*(1-wy) + float64(b01)*(1-wx)*wy + float64(b11)*wx*wy) / 0x101)
			a := uint8((float64(a00)*(1-wx)*(1-wy) + float64(a10)*wx*(1-wy) + float64(a01)*(1-wx)*wy + float64(a11)*wx*wy) / 0x101)

			scaled.Set(x, y, &color.RGBA{R: r, G: g, B: b, A: a})
		}
	}
	return scaled
}
