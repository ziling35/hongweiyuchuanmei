package app

import (
	"strings"
	"testing"
)

func TestImageSizeLimitsFallBackToDefaults(t *testing.T) {
	limits := ImageSizeConfig{}.sizeLimits()
	if limits.Step != 16 || limits.MinPixels != 655360 || limits.MaxPixels != 8294400 || limits.MaxEdge != 3840 || limits.MaxRatio != 3 {
		t.Fatalf("unexpected default limits: %+v", limits)
	}
}

func TestImageSizeLimitsHonorDeclaredValues(t *testing.T) {
	limits := ImageSizeConfig{Step: 1, MinPixels: 640000, MaxPixels: 4194304, MaxEdge: 4096, MaxRatio: 4}.sizeLimits()
	if limits.Step != 1 || limits.MinPixels != 640000 || limits.MaxPixels != 4194304 || limits.MaxEdge != 4096 || limits.MaxRatio != 4 {
		t.Fatalf("declared limits not applied: %+v", limits)
	}
}

func TestValidateCustomImageSizeUsesDeclaredLimits(t *testing.T) {
	defaults := ImageSizeConfig{}.sizeLimits()
	// 默认约束下：1920x1080 不是 16 的倍数、800x800 低于像素下限，都应被拒。
	if err := validateCustomImageSize("1920x1080", defaults); err == nil || !strings.Contains(err.Error(), "16 的倍数") {
		t.Fatalf("default limits should reject 1920x1080, got %v", err)
	}
	if err := validateCustomImageSize("800x800", defaults); err == nil || !strings.Contains(err.Error(), "总像素") {
		t.Fatalf("default limits should reject 800x800, got %v", err)
	}

	relaxed := ImageSizeConfig{Step: 1, MinPixels: 640000}.sizeLimits()
	for _, size := range []string{"1920x1080", "800x800"} {
		if err := validateCustomImageSize(size, relaxed); err != nil {
			t.Fatalf("relaxed limits should accept %s, got %v", size, err)
		}
	}
	// 放宽对齐后仍需拦截超长边与超大像素。
	if err := validateCustomImageSize("8000x800", relaxed); err == nil {
		t.Fatal("relaxed limits should still enforce max edge and ratio")
	}
}

func TestValidateImageCapabilityConfigRejectsOutOfRangeLimits(t *testing.T) {
	cases := []struct {
		size   ImageSizeConfig
		expect string
	}{
		{ImageSizeConfig{Parameter: "size", Default: "auto", AllowCustom: true, Step: 300}, "对齐步长"},
		{ImageSizeConfig{Parameter: "size", Default: "auto", AllowCustom: true, MinPixels: 100}, "最小像素"},
		{ImageSizeConfig{Parameter: "size", Default: "auto", AllowCustom: true, MinPixels: 900000, MaxPixels: 800000}, "最小像素不能大于最大像素"},
		{ImageSizeConfig{Parameter: "size", Default: "auto", AllowCustom: true, MaxEdge: 32}, "最长边"},
		{ImageSizeConfig{Parameter: "size", Default: "auto", AllowCustom: true, MaxRatio: 0.5}, "宽高比"},
	}
	for index, item := range cases {
		value := ImageCapabilityConfig{Size: item.size}
		err := validateImageCapabilityConfig(&value)
		if err == nil || !strings.Contains(err.Error(), item.expect) {
			t.Fatalf("case %d should be rejected with %q, got %v", index, item.expect, err)
		}
	}

	// 合法约束不应命中任何像素约束错误（其它字段缺失返回的错误与本次改动无关）。
	accepted := ImageCapabilityConfig{Size: ImageSizeConfig{Parameter: "size", Default: "auto", AllowCustom: true, Step: 1, MinPixels: 640000, MaxPixels: 8388608, MaxEdge: 4096, MaxRatio: 4}}
	if err := validateImageCapabilityConfig(&accepted); err != nil {
		for _, keyword := range []string{"对齐步长", "像素", "最长边", "宽高比"} {
			if strings.Contains(err.Error(), keyword) {
				t.Fatalf("valid declared limits rejected: %v", err)
			}
		}
	}
}
