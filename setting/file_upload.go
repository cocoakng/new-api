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

package setting

import (
	"os"

	"github.com/QuantumNous/new-api/common"
)

// R2 存储配置
// 用于视频/音频文件上传（Cloudflare R2，S3 兼容）
var (
	R2AccountID   = os.Getenv("R2_ACCOUNT_ID")
	R2AccessKeyID = os.Getenv("R2_ACCESS_KEY_ID")
	R2SecretKey   = os.Getenv("R2_SECRET_ACCESS_KEY")
	R2BucketName  = os.Getenv("R2_BUCKET_NAME")
	R2PublicURL   = os.Getenv("R2_PUBLIC_URL") // 如 https://media.ai-link.shop

	// 文件大小限制
	MaxImageSizeMB = common.GetEnvOrDefault("MAX_IMAGE_SIZE_MB", 20)
	MaxVideoSizeMB = common.GetEnvOrDefault("MAX_VIDEO_SIZE_MB", 20)
	MaxAudioSizeMB = common.GetEnvOrDefault("MAX_AUDIO_SIZE_MB", 10)

	// 允许的 MIME 类型
	AllowedImageMimes = []string{"image/jpeg", "image/png", "image/webp", "image/gif"}
	AllowedVideoMimes = []string{"video/mp4", "video/webm", "video/quicktime"}
	AllowedAudioMimes = []string{"audio/mpeg", "audio/wav", "audio/ogg", "audio/mp3"}
)
