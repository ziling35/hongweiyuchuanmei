package app

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"strconv"
	"strings"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"yingce/backend/internal/model"
)

const (
	// 源图上限与 task_media_storage 的产物校验保持一致，避免解压炸弹。
	maxResizeSourcePixels = 40_000_000
	// 重采样目标上限；与图片最长边校验的绝对上限一致。
	maxResizeTargetPixels = 40_000_000
	resizeJPEGQuality     = 92
)

// errImageResizeUnsupported 表示产物格式无法本地再编码（如 WebP/AVIF），调用方应保存原图。
var errImageResizeUnsupported = errors.New("产物格式不支持本地重采样")

// parsePixelTarget 只接受精确像素尺寸；比例、auto 与空值都不触发重采样。
func parsePixelTarget(size string) (width int, height int, ok bool) {
	raw := strings.ToLower(strings.TrimSpace(strings.ReplaceAll(size, "×", "x")))
	left, right, found := strings.Cut(raw, "x")
	if !found {
		return 0, 0, false
	}
	width, widthErr := strconv.Atoi(strings.TrimSpace(left))
	height, heightErr := strconv.Atoi(strings.TrimSpace(right))
	if widthErr != nil || heightErr != nil || width < 1 || height < 1 {
		return 0, 0, false
	}
	if int64(width)*int64(height) > maxResizeTargetPixels {
		return 0, 0, false
	}
	return width, height, true
}

// resizeImageBytes 把图片重采样成目标像素，保留 alpha 并沿用原格式。
// 返回的 format 为解码到的原始格式，调用方据此判断是否需要改 MIME。
func resizeImageBytes(raw []byte, width, height int) ([]byte, string, error) {
	config, format, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, "", err
	}
	if config.Width < 1 || config.Height < 1 || int64(config.Width)*int64(config.Height) > maxResizeSourcePixels {
		return nil, format, errors.New("产物图片尺寸超出重采样上限")
	}
	if format != "png" && format != "jpeg" {
		return nil, format, errImageResizeUnsupported
	}
	source, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, format, err
	}
	// NRGBA 保留透明像素；PNG 走它，JPEG 之后摊平到白底。
	target := image.NewNRGBA(image.Rect(0, 0, width, height))
	xdraw.CatmullRom.Scale(target, target.Bounds(), source, source.Bounds(), xdraw.Src, nil)
	var output bytes.Buffer
	if format == "jpeg" {
		flattened := image.NewRGBA(target.Bounds())
		xdraw.Draw(flattened, flattened.Bounds(), &image.Uniform{C: color.White}, image.Point{}, xdraw.Src)
		xdraw.Draw(flattened, flattened.Bounds(), target, target.Bounds().Min, xdraw.Over)
		if err := jpeg.Encode(&output, flattened, &jpeg.Options{Quality: resizeJPEGQuality}); err != nil {
			return nil, format, err
		}
		return output.Bytes(), format, nil
	}
	if err := png.Encode(&output, target); err != nil {
		return nil, format, err
	}
	return output.Bytes(), format, nil
}

// applyImageResizeCompensation 在图片产物落盘前，把上游实际返回的尺寸改成用户请求的尺寸。
// 只在能力开关开启时介入；任何识别或重采样失败都保留上游原图，绝不影响生成结果本身。
func (s *Service) applyImageResizeCompensation(task *model.Task, config providerConfig, path string) {
	if task == nil || config.CapabilityConfig == nil || config.CapabilityConfig.Image == nil {
		return
	}
	if !config.CapabilityConfig.Image.Size.ResizeToRequested {
		return
	}
	width, height, ok := parsePixelTarget(config.Size)
	if !ok {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		_ = s.log(task.UserID, task.ID, "warn", "读取生成结果失败，已跳过尺寸重采样", "")
		return
	}
	before, _, decodeErr := image.DecodeConfig(bytes.NewReader(raw))
	if decodeErr != nil {
		// WebP/AVIF 等标准库不解码的格式：保持原图，不报错。
		return
	}
	if before.Width == width && before.Height == height {
		return
	}
	resized, _, resizeErr := resizeImageBytes(raw, width, height)
	if resizeErr != nil {
		if !errors.Is(resizeErr, errImageResizeUnsupported) {
			_ = s.log(task.UserID, task.ID, "warn", "按请求尺寸重采样失败，已保存上游原图", resizeErr.Error())
		}
		return
	}
	if writeErr := os.WriteFile(path, resized, 0o600); writeErr != nil {
		_ = s.log(task.UserID, task.ID, "warn", "重采样结果写入失败，已保存上游原图", writeErr.Error())
		return
	}
	// 让用户知道这一张不是上游原生尺寸，避免把插值结果当成原生细节。
	_ = s.log(task.UserID, task.ID, "info", "产物已按请求尺寸重采样", fmt.Sprintf("上游 %dx%d → 交付 %dx%d", before.Width, before.Height, width, height))
}
