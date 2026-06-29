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
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// UploadFileRequest 上传文件请求（JSON body）
type UploadFileRequest struct {
	Data string `json:"data"` // base64 编码的文件数据（含 data:xxx;base64, 前缀或纯 base64）
}

// UploadFileResponse 上传文件响应
type UploadFileResponse struct {
	Url      string `json:"url"`       // 公网可访问的文件 URL
	Filename string `json:"filename"`  // 文件名
	Size     int    `json:"size"`      // 文件大小（字节）
	Mime     string `json:"mime"`      // MIME 类型
	FileType string `json:"file_type"` // 文件类型：image / video / audio
}

// UploadFile 上传文件到 R2 存储（支持图片、视频、音频）
func UploadFile(c *gin.Context) {
	if setting.R2AccountID == "" || setting.R2AccessKeyID == "" || setting.R2SecretKey == "" {
		common.ApiError(c, fmt.Errorf("file upload not configured: R2 credentials are empty"))
		return
	}
	if setting.R2BucketName == "" || setting.R2PublicURL == "" {
		common.ApiError(c, fmt.Errorf("file upload not configured: R2 bucket or public URL is empty"))
		return
	}

	var fileData []byte
	var mime string
	var filename string

	contentType := c.GetHeader("Content-Type")

	if strings.HasPrefix(contentType, "multipart/form-data") {
		// 处理文件上传
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			common.ApiError(c, fmt.Errorf("missing file: %w", err))
			return
		}
		defer file.Close()

		mime = header.Header.Get("Content-Type")
		if mime == "" {
			mime = mimeFromExtension(header.Filename)
		}

		if !isAllowedFileMime(mime) {
			common.ApiError(c, fmt.Errorf("unsupported file type: %s, allowed: jpeg, png, webp, gif, mp4, webm, mov, mp3, wav, ogg", mime))
			return
		}

		fileData, err = io.ReadAll(file)
		if err != nil {
			common.ApiError(c, fmt.Errorf("failed to read file: %w", err))
			return
		}

		filename = header.Filename

	} else {
		// 处理 JSON body（base64）
		var req UploadFileRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			common.ApiError(c, fmt.Errorf("invalid request: %w", err))
			return
		}

		if req.Data == "" {
			common.ApiError(c, fmt.Errorf("missing file data"))
			return
		}

		base64Data := req.Data
		if idx := strings.Index(base64Data, ";base64,"); idx != -1 {
			mime = base64Data[5:idx]
			base64Data = base64Data[idx+len(";base64,"):]
		}

		if !isAllowedFileMime(mime) {
			if mime == "" {
				mime = "image/png"
			} else {
				common.ApiError(c, fmt.Errorf("unsupported file type: %s", mime))
				return
			}
		}

		var err error
		fileData, err = base64.StdEncoding.DecodeString(base64Data)
		if err != nil {
			common.ApiError(c, fmt.Errorf("invalid base64 data: %w", err))
			return
		}

		ext := extFromFileMime(mime)
		filename = fmt.Sprintf("upload-%d.%s", time.Now().UnixMilli(), ext)
	}

	// 大小限制
	fileType := getFileCategory(mime)
	var maxSize int
	var maxLimitMB int
	if fileType == "image" {
		maxLimitMB = setting.MaxImageSizeMB
	} else if fileType == "video" {
		maxLimitMB = setting.MaxVideoSizeMB
	} else {
		maxLimitMB = setting.MaxAudioSizeMB
	}
	maxSize = maxLimitMB * 1024 * 1024
	if len(fileData) > maxSize {
		common.ApiError(c, fmt.Errorf("file too large: %d bytes (max %dMB)", len(fileData), maxLimitMB))
		return
	}

	// 图片自动压缩
	if fileType == "image" && len(fileData) > 10*1024*1024 {
		compressed, err := compressImage(fileData, mime)
		if err != nil {
			common.ApiError(c, fmt.Errorf("failed to compress image: %w", err))
			return
		}
		fileData = compressed
		mime = "image/jpeg"
		filename = strings.TrimSuffix(filename, ".png") + ".jpg"
		filename = strings.TrimSuffix(filename, ".webp") + ".jpg"
		filename = strings.TrimSuffix(filename, ".gif") + ".jpg"
	}

	// 生成唯一路径（上传到 temp 目录下）
	objectKey := fmt.Sprintf("temp/%s/%s", uuid.New().String(), filename)

	// 上传到 R2
	r2Url, err := uploadToR2(c.Request.Context(), fileData, objectKey, mime)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to upload file: %w", err))
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": UploadFileResponse{
			Url:      r2Url,
			Filename: filename,
			Size:     len(fileData),
			Mime:     mime,
			FileType: fileType,
		},
	})
}

// uploadToR2 上传文件到 Cloudflare R2（S3 兼容 API）
func uploadToR2(ctx context.Context, data []byte, objectKey string, mime string) (string, error) {
	r2Resolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL: fmt.Sprintf("https://%s.r2.cloudflarestorage.com", setting.R2AccountID),
		}, nil
	})

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithEndpointResolverWithOptions(r2Resolver),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			setting.R2AccessKeyID,
			setting.R2SecretKey,
			"",
		)),
		config.WithRegion("auto"),
	)
	if err != nil {
		return "", fmt.Errorf("load R2 config: %w", err)
	}

	client := s3.NewFromConfig(cfg)

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(setting.R2BucketName),
		Key:         aws.String(objectKey),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(mime),
	})
	if err != nil {
		return "", fmt.Errorf("R2 PutObject: %w", err)
	}

	return fmt.Sprintf("%s/%s", strings.TrimRight(setting.R2PublicURL, "/"), objectKey), nil
}

// isAllowedFileMime 检查 MIME 类型是否为允许的文件格式
func isAllowedFileMime(mime string) bool {
	for _, m := range setting.AllowedImageMimes {
		if mime == m {
			return true
		}
	}
	for _, m := range setting.AllowedVideoMimes {
		if mime == m {
			return true
		}
	}
	for _, m := range setting.AllowedAudioMimes {
		if mime == m {
			return true
		}
	}
	// 兼容变体
	if mime == "image/jpg" || mime == "audio/mp3" {
		return true
	}
	return false
}

// getFileCategory 返回文件大类
func getFileCategory(mime string) string {
	if strings.HasPrefix(mime, "image") {
		return "image"
	}
	if strings.HasPrefix(mime, "video") {
		return "video"
	}
	if strings.HasPrefix(mime, "audio") {
		return "audio"
	}
	return "unknown"
}

// mimeFromExtension 从文件名扩展名推断 MIME 类型
func mimeFromExtension(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".mp3":
		return "audio/mpeg"
	case ".wav":
		return "audio/wav"
	case ".ogg":
		return "audio/ogg"
	default:
		return "application/octet-stream"
	}
}

// extFromFileMime 从 MIME 类型获取扩展名
func extFromFileMime(mime string) string {
	switch mime {
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/webp":
		return "webp"
	case "image/gif":
		return "gif"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	case "video/quicktime":
		return "mov"
	case "audio/mpeg", "audio/mp3":
		return "mp3"
	case "audio/wav":
		return "wav"
	case "audio/ogg":
		return "ogg"
	default:
		return "bin"
	}
}
