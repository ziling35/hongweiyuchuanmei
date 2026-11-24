package app

import (
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestParseVideoSecondsSelector(t *testing.T) {
	tests := []struct {
		value string
		low   int
		high  int
		ok    bool
	}{
		{value: "5", low: 5, high: 5, ok: true},
		{value: "5-10", low: 5, high: 10, ok: true},
		{value: " 5 - 10 ", low: 5, high: 10, ok: true},
		{value: "0"},
		{value: ""},
		{value: "-3"},
		{value: "10-5"},
		{value: "abc"},
		{value: "5.5-8"},
		{value: "5-"},
	}
	for _, test := range tests {
		low, high, ok := parseVideoSecondsSelector(test.value)
		if ok != test.ok || (ok && (low != test.low || high != test.high)) {
			t.Fatalf("parseVideoSecondsSelector(%q) = (%d,%d,%v), want (%d,%d,%v)", test.value, low, high, ok, test.low, test.high, test.ok)
		}
	}
}

func TestNormalizeChannelModelTierSelectorVideoSecondsRange(t *testing.T) {
	selector, _, videoSeconds, err := normalizeChannelModelTierSelector("video", ChannelModelPriceTierRequest{Selector: map[string]string{"videoSeconds": "5-10"}})
	if err != nil {
		t.Fatal(err)
	}
	if selector["videoSeconds"] != "5-10" || videoSeconds != 5 {
		t.Fatalf("selector=%v videoSeconds=%d", selector, videoSeconds)
	}
	selector, _, videoSeconds, err = normalizeChannelModelTierSelector("video", ChannelModelPriceTierRequest{Selector: map[string]string{"videoSeconds": "8-8"}})
	if err != nil {
		t.Fatal(err)
	}
	if selector["videoSeconds"] != "8" || videoSeconds != 8 {
		t.Fatalf("equal bounds should normalize to exact: selector=%v videoSeconds=%d", selector, videoSeconds)
	}
	selector, _, videoSeconds, err = normalizeChannelModelTierSelector("video", ChannelModelPriceTierRequest{Selector: map[string]string{"videoSeconds": "0"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, exists := selector["videoSeconds"]; exists || videoSeconds != 0 {
		t.Fatalf("zero seconds means any duration: selector=%v videoSeconds=%d", selector, videoSeconds)
	}
	for _, value := range []string{"-3", "10-5", "abc", "5.5-8"} {
		if _, _, _, err := normalizeChannelModelTierSelector("video", ChannelModelPriceTierRequest{Selector: map[string]string{"videoSeconds": value}}); err == nil {
			t.Fatalf("invalid duration %q should be rejected", value)
		}
	}
}

func TestMatchSKUSelectorVideoSecondsRange(t *testing.T) {
	tier := map[string]string{"operation": "image_to_video", "videoSeconds": "5-10"}
	if matched, score := matchSKUSelector(tier, map[string]string{"operation": "image_to_video", "videoSeconds": "8"}); !matched || score != 2 {
		t.Fatalf("8s should hit 5-10 tier: matched=%v score=%d", matched, score)
	}
	if matched, _ := matchSKUSelector(tier, map[string]string{"operation": "image_to_video", "videoSeconds": "12"}); matched {
		t.Fatal("12s must not hit 5-10 tier")
	}
	if matched, _ := matchSKUSelector(tier, map[string]string{"operation": "image_to_video"}); matched {
		t.Fatal("request without duration must not hit duration tier")
	}
	if matched, _ := matchSKUSelector(map[string]string{"videoSeconds": "10"}, map[string]string{"videoSeconds": "10"}); !matched {
		t.Fatal("exact tier should still match")
	}
	if matched, _ := matchSKUSelector(map[string]string{"videoSeconds": "10"}, map[string]string{"videoSeconds": "7"}); matched {
		t.Fatal("exact tier must not match other durations")
	}
	if matched, _ := matchSKUSelector(map[string]string{"videoSeconds": "5-10"}, map[string]string{"videoSeconds": "abc"}); matched {
		t.Fatal("non-numeric request must not hit range tier")
	}
}

func TestChannelModelHasCompatiblePriceTierAcceptsDurationRange(t *testing.T) {
	channelModel := model.ChannelModel{
		PriceTiers: []model.ChannelModelPriceTier{{
			SelectorJSON:    `{"operation":"image_to_video","videoSeconds":"5-10"}`,
			Enabled:         true,
			PriceConfigured: true,
		}},
	}
	for _, seconds := range []string{"5", "8", "10"} {
		intent := ModelRequestIntent{Capability: "video", Options: map[string]any{"videoSeconds": seconds}}
		if !channelModelHasCompatiblePriceTier(channelModel, intent) {
			t.Fatalf("%ss request should be compatible with 5-10 tier", seconds)
		}
	}
	if channelModelHasCompatiblePriceTier(channelModel, ModelRequestIntent{Capability: "video", Options: map[string]any{"videoSeconds": "12"}}) {
		t.Fatal("12s request should not be compatible with 5-10 tier")
	}
}

func TestNormalizeChannelModelPriceTiersRejectsOverlappingDurationRanges(t *testing.T) {
	nextID := func(prefix string) (string, error) { return prefix + "-test", nil }
	tier := func(seconds string) ChannelModelPriceTierRequest {
		return ChannelModelPriceTierRequest{
			Selector:    map[string]string{"operation": "image_to_video", "videoSeconds": seconds},
			BillingMode: "per_second", UnitPriceMicrocredits: 1_000_000, PriceConfigured: true,
		}
	}
	request := func(first, second string) ChannelModelRequest {
		return ChannelModelRequest{PriceTiers: []ChannelModelPriceTierRequest{tier(first), tier(second)}}
	}
	if _, err := normalizeChannelModelPriceTiersWithIDs(request("5-10", "8-12"), "video", "", "upstream", nextID); err == nil {
		t.Fatal("overlapping duration ranges should be rejected")
	} else if !strings.Contains(err.Error(), "时长范围重叠") {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, err := normalizeChannelModelPriceTiersWithIDs(request("10", "8-12"), "video", "", "upstream", nextID); err == nil {
		t.Fatal("exact duration inside a range should be rejected")
	}
	if _, err := normalizeChannelModelPriceTiersWithIDs(request("5-8", "9-12"), "video", "", "upstream", nextID); err != nil {
		t.Fatal(err)
	}
	// 通配时长档与区间档是“精确优先、通配兜底”的合法组合。
	wildcard := tier("5-10")
	wildcard.Selector = map[string]string{"operation": "image_to_video"}
	if _, err := normalizeChannelModelPriceTiersWithIDs(ChannelModelRequest{PriceTiers: []ChannelModelPriceTierRequest{wildcard, tier("5-10")}}, "video", "", "upstream", nextID); err != nil {
		t.Fatal(err)
	}
}

func TestValidateChannelModelTierCapabilitiesVideoSecondsRange(t *testing.T) {
	enumConfig := marshalCapabilityConfig(t, ModelCapabilityConfig{Video: &VideoCapabilityConfig{
		Duration: VideoDurationConfig{Selection: "enum", Values: []int{5, 10, 15}, Default: 5},
	}})
	if err := validateChannelModelTierCapabilities(tiersWithDuration("5-10"), enumConfig, "video", ""); err != nil {
		t.Fatal(err)
	}
	if err := validateChannelModelTierCapabilities(tiersWithDuration("6-8"), enumConfig, "video", ""); err == nil {
		t.Fatal("range covering no enum value should be rejected")
	}
	rangeConfig := marshalCapabilityConfig(t, ModelCapabilityConfig{Video: &VideoCapabilityConfig{
		Duration: VideoDurationConfig{Selection: "range", Min: 4, Max: 12, Step: 2, Default: 5},
	}})
	if err := validateChannelModelTierCapabilities(tiersWithDuration("5-9"), rangeConfig, "video", ""); err != nil {
		t.Fatalf("range covering step-aligned durations should pass: %v", err)
	}
	if err := validateChannelModelTierCapabilities(tiersWithDuration("5-5"), rangeConfig, "video", ""); err == nil {
		t.Fatal("exact duration off the capability step should be rejected")
	}
	if err := validateChannelModelTierCapabilities(tiersWithDuration("6-6"), rangeConfig, "video", ""); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilitySpecWithPriceTiersExpandsDurationRangeCoverage(t *testing.T) {
	spec := CapabilitySpec{
		Version: 1, Capability: "video",
		Options: map[string]OptionConstraint{"videoSeconds": numericRange(4, 12, 1)},
	}
	channelModel := model.ChannelModel{PriceTiers: []model.ChannelModelPriceTier{{
		SelectorJSON:    `{"videoSeconds":"5-10"}`,
		Enabled:         true,
		PriceConfigured: true,
	}}}
	result := capabilitySpecWithPriceTiers(spec, channelModel)
	values := result.Options["videoSeconds"].Values
	if len(values) != 6 || values[0] != 5 || values[len(values)-1] != 10 {
		t.Fatalf("5-10 tier should expose 5..10 seconds: %v", values)
	}
	// 通配时长档不收紧可选时长。
	wildcard := model.ChannelModel{PriceTiers: []model.ChannelModelPriceTier{{Enabled: true, PriceConfigured: true}}}
	if result := capabilitySpecWithPriceTiers(spec, wildcard); len(result.Options["videoSeconds"].Values) != 0 {
		t.Fatalf("wildcard tier should keep declared options: %v", result.Options["videoSeconds"].Values)
	}
	// 精确档与区间档并存的覆盖并集。
	mixed := model.ChannelModel{PriceTiers: []model.ChannelModelPriceTier{
		{SelectorJSON: `{"videoSeconds":"10"}`, Enabled: true, PriceConfigured: true},
		{SelectorJSON: `{"videoSeconds":"5-8"}`, Enabled: true, PriceConfigured: true},
	}}
	result = capabilitySpecWithPriceTiers(spec, mixed)
	if values := result.Options["videoSeconds"].Values; len(values) != 5 || values[0] != 5 || values[4] != 10 {
		t.Fatalf("exact and range tiers should union their coverage: %v", values)
	}
}

func TestChannelModelDefaultOptionsPickCoveredDurationForRangeTier(t *testing.T) {
	config := &ModelCapabilityConfig{Video: &VideoCapabilityConfig{
		Duration:          VideoDurationConfig{Selection: "range", Min: 4, Max: 12, Step: 2, Default: 4},
		Resolutions:       []string{"720p"},
		DefaultResolution: "720p",
	}}
	spec, err := CapabilitySpecFromModelCapabilityConfig(config, "video")
	if err != nil {
		t.Fatal(err)
	}
	channelModel := model.ChannelModel{CapabilityConfigJSON: "{}", PriceTiers: []model.ChannelModelPriceTier{{
		SelectorJSON:    `{"videoSeconds":"5-9"}`,
		Enabled:         true,
		PriceConfigured: true,
	}}}
	defaults, err := channelModelDefaultOptions(channelModel, capabilitySpecWithPriceTiers(spec, channelModel), config)
	if err != nil {
		t.Fatal(err)
	}
	// 5 不在能力 step（4,6,8…）上，默认时长应取档内第一个被支持的 6 秒。
	if defaults["videoSeconds"] != 6 {
		t.Fatalf("default videoSeconds = %v, want 6", defaults["videoSeconds"])
	}
}

func tiersWithDuration(seconds string) []model.ChannelModelPriceTier {
	return []model.ChannelModelPriceTier{{Selector: map[string]string{"videoSeconds": seconds}, Resolution: "*", VideoSeconds: 5}}
}

func marshalCapabilityConfig(t *testing.T, config ModelCapabilityConfig) string {
	t.Helper()
	raw, err := json.Marshal(config)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}
