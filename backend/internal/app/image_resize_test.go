package app

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"yingce/backend/internal/model"
)

func encodeTestPNG(t *testing.T, picture image.Image) []byte {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, picture); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buffer.Bytes()
}

func encodeTestJPEG(t *testing.T, picture image.Image) []byte {
	t.Helper()
	var buffer bytes.Buffer
	if err := jpeg.Encode(&buffer, picture, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode jpeg: %v", err)
	}
	return buffer.Bytes()
}

func TestParsePixelTarget(t *testing.T) {
	cases := []struct {
		size   string
		width  int
		height int
		ok     bool
	}{
		{"800x800", 800, 800, true},
		{"1024×1536", 1024, 1536, true},
		{" 800 X 600 ", 800, 600, true},
		{"auto", 0, 0, false},
		{"1:1", 0, 0, false},
		{"", 0, 0, false},
		{"0x100", 0, 0, false},
		{"-8x8", 0, 0, false},
		{"800x", 0, 0, false},
		{"80000x80000", 0, 0, false},
	}
	for _, testCase := range cases {
		width, height, ok := parsePixelTarget(testCase.size)
		if ok != testCase.ok || width != testCase.width || height != testCase.height {
			t.Fatalf("parsePixelTarget(%q) = (%d, %d, %v), want (%d, %d, %v)", testCase.size, width, height, ok, testCase.width, testCase.height, testCase.ok)
		}
	}
}

// 缩小到精确像素时保留透明通道：四角透明、中心不透明。
func TestResizeImageBytesKeepsAlphaOnPNG(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 64, 64))
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			if x < 16 || y < 16 || x >= 48 || y >= 48 {
				continue
			}
			source.SetNRGBA(x, y, color.NRGBA{R: 220, G: 40, B: 40, A: 255})
		}
	}
	output, format, err := resizeImageBytes(encodeTestPNG(t, source), 32, 32)
	if err != nil {
		t.Fatalf("resize: %v", err)
	}
	if format != "png" {
		t.Fatalf("format = %q, want png", format)
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(output))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decodedFormat != "png" {
		t.Fatalf("decoded format = %q, want png", decodedFormat)
	}
	if decoded.Bounds().Dx() != 32 || decoded.Bounds().Dy() != 32 {
		t.Fatalf("size = %dx%d, want 32x32", decoded.Bounds().Dx(), decoded.Bounds().Dy())
	}
	_, _, _, cornerAlpha := decoded.At(0, 0).RGBA()
	if cornerAlpha != 0 {
		t.Fatalf("corner alpha = %d, want 0 (透明通道被丢弃)", cornerAlpha)
	}
	_, _, _, centerAlpha := decoded.At(16, 16).RGBA()
	if centerAlpha != 0xffff {
		t.Fatalf("center alpha = %d, want 65535", centerAlpha)
	}
}

// JPEG 没有 alpha，重采样后仍必须是 JPEG，且尺寸精确。
func TestResizeImageBytesKeepsJPEGFormat(t *testing.T) {
	source := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 40; x++ {
			source.SetRGBA(x, y, color.RGBA{R: 30, G: 120, B: 200, A: 255})
		}
	}
	output, format, err := resizeImageBytes(encodeTestJPEG(t, source), 800, 800)
	if err != nil {
		t.Fatalf("resize: %v", err)
	}
	if format != "jpeg" {
		t.Fatalf("format = %q, want jpeg", format)
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(output))
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decodedFormat != "jpeg" {
		t.Fatalf("decoded format = %q, want jpeg", decodedFormat)
	}
	if decoded.Bounds().Dx() != 800 || decoded.Bounds().Dy() != 800 {
		t.Fatalf("size = %dx%d, want 800x800", decoded.Bounds().Dx(), decoded.Bounds().Dy())
	}
}

// 无法再编码的格式必须明确返回不支持，让调用方保留原图而不是写坏文件。
func TestResizeImageBytesRejectsUnsupportedFormat(t *testing.T) {
	if _, _, err := resizeImageBytes([]byte("not-an-image"), 10, 10); err == nil {
		t.Fatal("非图片内容应返回错误")
	}
	// 1x1 GIF：标准库可解码但本实现不重新编码。
	gif1x1 := []byte{
		0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
		0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00,
		0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02,
		0x44, 0x01, 0x00, 0x3b,
	}
	if _, format, err := resizeImageBytes(gif1x1, 4, 4); err != errImageResizeUnsupported {
		t.Fatalf("gif err = %v (format %q), want errImageResizeUnsupported", err, format)
	}
}

// 开关关闭、缺少能力配置或尺寸不是精确像素时都不能碰产物，这是 B 方案的安全边界。
func TestApplyImageResizeCompensationSkipsWhenDisabled(t *testing.T) {
	raw := encodeTestPNG(t, image.NewNRGBA(image.Rect(0, 0, 64, 64)))
	check := func(name string, config providerConfig) {
		path := filepath.Join(t.TempDir(), name+".png")
		if err := os.WriteFile(path, raw, 0o600); err != nil {
			t.Fatalf("write: %v", err)
		}
		service := &Service{}
		service.applyImageResizeCompensation(&model.Task{ID: "task-1", UserID: "user-1"}, config, path)
		after, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		if !bytes.Equal(after, raw) {
			t.Fatalf("%s: 未开启重采样却改动了产物", name)
		}
	}
	check("no-capability", providerConfig{Size: "32x32"})
	check("flag-off", providerConfig{
		Size: "32x32",
		CapabilityConfig: &ModelCapabilityConfig{Image: &ImageCapabilityConfig{
			Size: ImageSizeConfig{Parameter: "size", ResizeToRequested: false},
		}},
	})
	check("ratio-size", providerConfig{
		Size: "1:1",
		CapabilityConfig: &ModelCapabilityConfig{Image: &ImageCapabilityConfig{
			Size: ImageSizeConfig{Parameter: "size", ResizeToRequested: true},
		}},
	})
}

// 开关只在能表达精确像素的尺寸参数上有意义，比例参数必须在保存时就被拒绝。
func TestValidateImageCapabilityConfigRequiresPixelSizeForResize(t *testing.T) {
	base := ImageCapabilityConfig{References: ImageReferenceConfig{PromptMaxChars: 4096}, MaxOutputs: 1}
	ratio := base
	ratio.Size = ImageSizeConfig{Parameter: "aspect_ratio", ResizeToRequested: true}
	if err := validateImageCapabilityConfig(&ratio); err == nil {
		t.Fatal("比例参数开启按请求尺寸重采样应被拒绝")
	}
	pixel := base
	pixel.Size = ImageSizeConfig{Parameter: "size", Values: []string{"1024x1024", "800x800"}, Default: "1024x1024", ResizeToRequested: true}
	if err := validateImageCapabilityConfig(&pixel); err != nil {
		t.Fatalf("精确像素参数开启按请求尺寸重采样应被接受: %v", err)
	}
}
