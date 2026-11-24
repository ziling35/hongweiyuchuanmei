// 渠道模型价格档：选择器规范化、档位能力与计价校验、摘要回填。

package app

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"yingce/backend/internal/imagebilling"
	"yingce/backend/internal/model"
	protocolcontract "yingce/backend/internal/protocol"
)

// parseVideoSecondsSelector 解析价格档时长条件："N" 表示固定秒数，"N-M" 表示闭区间，
// 与请求侧的精确秒数在同一选择器协议下并存；空值和 0 由调用方按“任意时长”处理。
func parseVideoSecondsSelector(value string) (low int, high int, ok bool) {
	value = strings.TrimSpace(value)
	if dash := strings.IndexByte(value, '-'); dash >= 0 {
		low, lowErr := strconv.Atoi(strings.TrimSpace(value[:dash]))
		high, highErr := strconv.Atoi(strings.TrimSpace(value[dash+1:]))
		if lowErr != nil || highErr != nil || low <= 0 || high < low {
			return 0, 0, false
		}
		return low, high, true
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return 0, 0, false
	}
	return seconds, seconds, true
}

// videoDurationRangeCovered 要求时长区间档至少覆盖一个模型支持的时长，
// 避免保存永远无法命中的死档；enum 按枚举值判断，range 按 step 对齐交集判断。
func videoDurationRangeCovered(video *VideoCapabilityConfig, low int, high int, enumValues map[int]bool) bool {
	if video.Duration.Selection == "enum" {
		for seconds := range enumValues {
			if seconds >= low && seconds <= high {
				return true
			}
		}
		return false
	}
	min, max, step := video.Duration.Min, video.Duration.Max, video.Duration.Step
	if step <= 0 {
		step = 1
	}
	first := low
	if first < min {
		first = min
	}
	if remainder := (first - min) % step; remainder != 0 {
		first += step - remainder
	}
	return first >= min && first <= high && first <= max
}

// durationTierSelectorsConflict 判断两个价格档是否会以同一优先级命中同一时长请求：
// 选择器条件集合相同、非时长条件相等，且两个时长约束（精确或区间）有交集。
func durationTierSelectorsConflict(a map[string]string, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	hasDuration := false
	for key, valueA := range a {
		valueB, exists := b[key]
		if !exists {
			return false
		}
		if key == "videoSeconds" {
			hasDuration = true
			continue
		}
		if valueA != valueB {
			return false
		}
	}
	if !hasDuration {
		// 完全相同的选择器已由 selector_key 去重拦截；这里只处理时长条件差异。
		return false
	}
	lowA, highA, okA := parseVideoSecondsSelector(a["videoSeconds"])
	lowB, highB, okB := parseVideoSecondsSelector(b["videoSeconds"])
	if !okA || !okB {
		return false
	}
	return lowA <= highB && lowB <= highA
}

func validateChannelModelTierCapabilities(tiers []model.ChannelModelPriceTier, rawCapabilityConfig string, capability string, protocol string) error {
	if capability == "image" {
		config, err := DecodeModelCapabilityConfig(rawCapabilityConfig)
		if err != nil || config == nil || config.Image == nil {
			return BadAuthRequest("图片模型能力配置无效，无法校验价格档规格")
		}
		image := config.Image
		if image.Parameters != nil {
			for _, tier := range tiers {
				if err := validateImageParameterPriceSelector(image.Parameters, tier.Selector); err != nil {
					return err
				}
			}
			return nil
		}
		normalizeLegacyImageResolutionConfig(protocol, image)
		for _, tier := range tiers {
			if value := strings.TrimSpace(tier.Selector["imageResolution"]); value != "" && value != "*" && !image.Resolution.Supported {
				return BadAuthRequest("价格档使用了未启用的图片分辨率条件")
			}
			if value := strings.TrimSpace(tier.Selector["imageResolution"]); value != "" && value != "*" && !containsCapabilityString(image.Resolution.Values, value) {
				return BadAuthRequest("价格档分辨率不在该图片模型支持范围内：" + value)
			}
			if value := strings.TrimSpace(tier.Selector["quality"]); value != "" && value != "*" {
				if image.Quality.Supported {
					if !containsCapabilityString(image.Quality.Values, value) {
						return BadAuthRequest("价格档质量不在该图片模型支持范围内：" + value)
					}
				} else if !legacyImageResolutionProtocol(protocol) || !image.Resolution.Supported || !containsCapabilityString(image.Resolution.Values, value) {
					return BadAuthRequest("价格档使用了未启用的图片质量条件")
				}
			}
		}
		return nil
	}
	if capability != "video" {
		return nil
	}
	config, err := DecodeModelCapabilityConfig(rawCapabilityConfig)
	if err != nil || config == nil || config.Video == nil {
		return BadAuthRequest("视频模型能力配置无效，无法校验价格档规格")
	}
	resolutionSupported := make(map[string]bool, len(config.Video.Resolutions))
	for _, resolution := range config.Video.Resolutions {
		resolutionSupported[normalizeChannelModelTierResolution(resolution)] = true
	}
	// Keep preset prices when narrowing the selected list; tasks use only selected values.
	if config.Video.FixedScreenSpec != nil {
		for _, resolution := range config.Video.FixedScreenSpec.Resolutions {
			resolutionSupported[normalizeChannelModelTierResolution(resolution)] = true
		}
	}
	durationSupported := make(map[int]bool, len(config.Video.Duration.Values))
	for _, seconds := range config.Video.Duration.Values {
		durationSupported[seconds] = true
	}
	for _, tier := range tiers {
		if tier.Resolution != "*" && !resolutionSupported[normalizeChannelModelTierResolution(tier.Resolution)] {
			return BadAuthRequest("价格档分辨率不在该视频模型支持范围内：" + tier.Resolution)
		}
		raw := strings.TrimSpace(tier.Selector["videoSeconds"])
		if raw == "" {
			raw = strconv.Itoa(tier.VideoSeconds)
		}
		low, high, hasDuration := parseVideoSecondsSelector(raw)
		if !hasDuration {
			continue
		}
		if !videoDurationSupported(config.Video) {
			continue
		}
		if low == high {
			if config.Video.Duration.Selection == "enum" && !durationSupported[low] {
				return BadAuthRequest(fmt.Sprintf("价格档时长 %d 秒不在该视频模型支持范围内", low))
			}
			if config.Video.Duration.Selection == "range" && (low < config.Video.Duration.Min || low > config.Video.Duration.Max || (config.Video.Duration.Step > 0 && (low-config.Video.Duration.Min)%config.Video.Duration.Step != 0)) {
				return BadAuthRequest(fmt.Sprintf("价格档时长 %d 秒不在该视频模型支持范围内", low))
			}
			continue
		}
		if !videoDurationRangeCovered(config.Video, low, high, durationSupported) {
			return BadAuthRequest(fmt.Sprintf("价格档时长范围 %d-%d 秒未覆盖该视频模型支持的时长", low, high))
		}
	}
	return nil
}

// syncLogicalModelsFromChannelModel 只失效路由目录。系统渠道 SKU 与前台模型目录
// 分别维护：保存渠道模型绝不能自动创建、覆盖或删除前台模型及其线路配置。
func (s *Service) syncLogicalModelsFromChannelModel(actor *model.User, channelModel *model.ChannelModel) error {
	_ = actor
	_ = channelModel
	s.invalidateRouteCatalog()
	return nil
}

func supportsTokenBilling(capability string, protocol model.ChannelInterfaceType) bool {
	return capability == "text" || capability == "video" || (capability == "audio" && protocol == model.ChannelInterfaceEvoLinkQwenAudioTTS)
}

func (s *Service) normalizeChannelModelPriceTiers(req ChannelModelRequest, capability string, protocol model.ChannelInterfaceType, fallbackProviderModelKey string) ([]model.ChannelModelPriceTier, error) {
	return normalizeChannelModelPriceTiersWithIDs(req, capability, protocol, fallbackProviderModelKey, s.repo.NextPrefixedID)
}

func normalizeChannelModelPriceTiersWithIDs(req ChannelModelRequest, capability string, protocol model.ChannelInterfaceType, fallbackProviderModelKey string, nextID func(string) (string, error)) ([]model.ChannelModelPriceTier, error) {
	inputs := req.PriceTiers
	// 兼容旧管理 API：没有 priceTiers 的请求等价于一个默认价格档。
	if len(inputs) == 0 {
		enabled := true
		inputs = []ChannelModelPriceTierRequest{{
			Resolution: "*", VideoSeconds: 0, ProviderModelKey: fallbackProviderModelKey,
			BillingMode: req.BillingMode, UnitPriceMicrocredits: req.UnitPriceMicrocredits,
			InputTokenPriceMicrocredits: req.InputTokenPriceMicrocredits, OutputTokenPriceMicrocredits: req.OutputTokenPriceMicrocredits,
			CachedTokenPriceMicrocredits: req.CachedTokenPriceMicrocredits, CacheWriteTokenPriceMicrocredits: req.CacheWriteTokenPriceMicrocredits,
			PriceConfigured: req.PriceConfigured, Enabled: &enabled,
		}}
	}
	result := make([]model.ChannelModelPriceTier, 0, len(inputs))
	seen := make(map[string]bool, len(inputs))
	for _, input := range inputs {
		var parameters []protocolcontract.ImageParameter
		if req.CapabilityConfig != nil && req.CapabilityConfig.Image != nil {
			parameters = req.CapabilityConfig.Image.Parameters
		}
		selector, resolution, videoSeconds, selectorErr := normalizeChannelModelTierSelector(capability, input, parameters)
		if selectorErr != nil {
			return nil, selectorErr
		}
		_, key, keyErr := model.CanonicalSKUSelector(selector)
		if keyErr != nil {
			return nil, keyErr
		}
		if seen[key] {
			return nil, BadAuthRequest("同一个操作和规格组合只能配置一个价格档")
		}
		seen[key] = true
		billingMode := strings.TrimSpace(input.BillingMode)
		if billingMode == "" {
			billingMode = "fixed_request"
		}
		if err := validateChannelModelTierPricing(capability, protocol, billingMode, input); err != nil {
			return nil, err
		}
		rules, rulesErr := normalizeTokenPriceRules(capability, billingMode, input.TokenPriceRulesEnabled, input.TokenPriceRules)
		if rulesErr != nil {
			return nil, rulesErr
		}
		id, idErr := nextID("PTIER")
		if idErr != nil {
			return nil, idErr
		}
		enabled := input.Enabled == nil || *input.Enabled
		result = append(result, model.ChannelModelPriceTier{
			ImagePricing:                        input.ImagePricing,
			CostPricing:                         input.CostPricing,
			ID:                                  id,
			SelectorKey:                         key,
			SelectorJSON:                        key,
			Selector:                            selector,
			Resolution:                          resolution,
			VideoSeconds:                        videoSeconds,
			ProviderModelKey:                    strings.TrimPrefix(strings.TrimSpace(firstNonEmpty(input.ProviderModelKey, fallbackProviderModelKey)), "models/"),
			BillingMode:                         billingMode,
			UnitPriceMicrocredits:               input.UnitPriceMicrocredits,
			InputTokenPriceMicrocredits:         input.InputTokenPriceMicrocredits,
			OutputTokenPriceMicrocredits:        input.OutputTokenPriceMicrocredits,
			CachedTokenPriceMicrocredits:        input.CachedTokenPriceMicrocredits,
			CacheWriteTokenPriceMicrocredits:    input.CacheWriteTokenPriceMicrocredits,
			TokenPriceRulesEnabled:              input.TokenPriceRulesEnabled && len(rules) > 0,
			TokenPriceRules:                     rules,
			ReferenceVideoUnitPriceMicrocredits: input.ReferenceVideoUnitPriceMicrocredits,
			ReferenceVideoOutputTokenPriceMicrocredits: input.ReferenceVideoOutputTokenPriceMicrocredits,
			ReferenceImageUnitPriceMicrocredits:        input.ReferenceImageUnitPriceMicrocredits,
			FreeReferenceImages:                        input.FreeReferenceImages,
			PriceConfigured:                            input.PriceConfigured,
			Enabled:                                    enabled,
			PriceVersion:                               1,
		})
	}
	// 同优先级时长区间不得相交：其他条件完全相同的两个档同时命中同一请求时，
	// 命中结果取决于档位顺序，属于配置歧义，与前端 priceSelectorIssues 同口径拦截。
	for index := range result {
		for previous := range result[:index] {
			if durationTierSelectorsConflict(result[previous].Selector, result[index].Selector) {
				return nil, BadAuthRequest(fmt.Sprintf("价格档 %d 与 %d 的时长范围重叠，请调整时长区间", previous+1, index+1))
			}
		}
	}
	return result, nil
}

// normalizeTokenPriceRules 校验并规范化分时与上下文规则。规则只对文本 Token 档有意义；
// 其他计费方式提交非空规则时直接拒绝，避免管理员误以为规则已生效。
func normalizeTokenPriceRules(capability string, billingMode string, enabled bool, inputs []model.TokenPriceRule) ([]model.TokenPriceRule, error) {
	if len(inputs) == 0 {
		if enabled {
			return nil, BadAuthRequest("启用分时与上下文价格时至少需要一条规则")
		}
		return []model.TokenPriceRule{}, nil
	}
	if capability != "text" || billingMode != "token" {
		return nil, BadAuthRequest("分时与上下文价格仅支持文本模型的 Token 计费")
	}
	if len(inputs) > model.MaxTokenPriceRules {
		return nil, BadAuthRequest(fmt.Sprintf("每个价格档最多配置 %d 条分时与上下文规则", model.MaxTokenPriceRules))
	}
	result := make([]model.TokenPriceRule, 0, len(inputs))
	for index, input := range inputs {
		fail := func(text string) error {
			return BadAuthRequest(fmt.Sprintf("分时规则 %d：%s", index+1, text))
		}
		days := make([]int, 0, 7)
		seen := map[int]bool{}
		for _, day := range input.Weekdays {
			if day < 1 || day > 7 {
				return nil, fail("星期只能是周一到周日")
			}
			if !seen[day] {
				seen[day] = true
				days = append(days, day)
			}
		}
		if len(days) == 0 {
			return nil, fail("请至少选择一天")
		}
		sort.Ints(days)
		start, err := model.ParseTokenPriceClock(input.Start, false)
		if err != nil {
			return nil, fail("开始时间必须是 00:00 到 23:59")
		}
		end, err := model.ParseTokenPriceClock(input.End, true)
		if err != nil {
			return nil, fail("结束时间必须是 00:01 到 24:00")
		}
		if start >= end {
			return nil, fail("结束时间必须晚于开始时间；跨零点请拆成两条规则")
		}
		if input.MinInputTokens < 0 || input.MaxInputTokens < 0 {
			return nil, fail("输入上下文 Token 不能小于 0")
		}
		if input.MaxInputTokens > 0 && input.MaxInputTokens <= input.MinInputTokens {
			return nil, fail("输入上下文上限必须大于下限")
		}
		if err := validateTokenPrices(capability, input.InputTokenPriceMicrocredits, input.OutputTokenPriceMicrocredits, input.CachedTokenPriceMicrocredits, input.CacheWriteTokenPriceMicrocredits); err != nil {
			return nil, fail(err.Error())
		}
		result = append(result, model.TokenPriceRule{
			Enabled: input.Enabled, Weekdays: days,
			Start: fmt.Sprintf("%02d:%02d", start/60, start%60), End: fmt.Sprintf("%02d:%02d", end/60, end%60),
			MinInputTokens: input.MinInputTokens, MaxInputTokens: input.MaxInputTokens,
			InputTokenPriceMicrocredits: input.InputTokenPriceMicrocredits, OutputTokenPriceMicrocredits: input.OutputTokenPriceMicrocredits,
			CachedTokenPriceMicrocredits: input.CachedTokenPriceMicrocredits, CacheWriteTokenPriceMicrocredits: input.CacheWriteTokenPriceMicrocredits,
		})
	}
	return result, nil
}

func normalizeChannelModelTierSelector(capability string, input ChannelModelPriceTierRequest, parameters ...[]protocolcontract.ImageParameter) (map[string]string, string, int, error) {
	if capability == "image" && len(parameters) > 0 && parameters[0] != nil {
		if input.VideoSeconds != 0 || input.Resolution != "" && input.Resolution != "*" {
			return nil, "", 0, BadAuthRequest("图片价格不接受视频规格")
		}
		selector := make(map[string]string, len(input.Selector))
		for name, value := range input.Selector {
			name, value = strings.TrimSpace(name), strings.TrimSpace(value)
			if name == "" || value == "" || value == "*" {
				continue
			}
			if _, exists := selector[name]; exists {
				return nil, "", 0, BadAuthRequest("价格档存在重复规格条件：" + name)
			}
			selector[name] = value
		}
		if err := validateImageParameterPriceSelector(parameters[0], selector); err != nil {
			return nil, "", 0, err
		}
		return selector, "*", 0, nil
	}
	selector := make(map[string]string, len(input.Selector)+3)
	for rawKey, rawValue := range input.Selector {
		key := strings.TrimSpace(rawKey)
		value := strings.TrimSpace(rawValue)
		if key == "" || value == "" {
			continue
		}
		switch key {
		case "operation":
			value = strings.ToLower(value)
		case "quality", "imageResolution", "size":
			value = strings.ToLower(value)
			if value == "auto" || value == "any" {
				value = "*"
			}
		case "resoluton":
			// Normalize the historical misspelling at the input boundary.
			key = "imageResolution"
			value = strings.ToLower(strings.TrimSpace(value))
			if value == "auto" || value == "any" {
				value = "*"
			}
		case "vquality":
			value = normalizeChannelModelTierResolution(value)
		case "resolution":
			// 兼容图片价格档的标准字段，以及历史接口误拼写 resoluton。
			key = "resolution"
			value = strings.ToLower(strings.TrimSpace(value))
		case "videoSeconds":
			if seconds, err := strconv.Atoi(value); err == nil && seconds == 0 {
				continue
			}
			low, high, ok := parseVideoSecondsSelector(value)
			if !ok {
				return nil, "", 0, BadAuthRequest("视频价格档时长必须是正整数或 N-M 秒区间")
			}
			if low == high {
				value = strconv.Itoa(low)
			} else {
				value = fmt.Sprintf("%d-%d", low, high)
			}
		case "imageCount":
			count, err := strconv.Atoi(value)
			if err != nil || count < 0 {
				return nil, "", 0, BadAuthRequest("参考图片数量必须是非负整数")
			}
			if count == 0 {
				continue
			}
			value = strconv.Itoa(count)
		case "videoGenerateAudio":
			if capability != "video" {
				return nil, "", 0, BadAuthRequest("只有视频模型可以按是否生成音频配置价格档")
			}
			value = strings.ToLower(value)
			if value == "*" {
				continue
			}
			if value != "true" && value != "false" {
				return nil, "", 0, BadAuthRequest("视频价格档音频条件必须为 true、false 或 *")
			}
		case "fpsBand":
			if capability != "video" {
				return nil, "", 0, BadAuthRequest("只有视频模型可以按帧率档配置价格档")
			}
			value = strings.ToLower(value)
			if value == "*" {
				continue
			}
			if value != "le30" && value != "le60" && value != "le120" {
				return nil, "", 0, BadAuthRequest("视频价格档帧率条件必须为 le30、le60、le120 或 *")
			}
		default:
			if capability != "image" {
				return nil, "", 0, BadAuthRequest("价格档不支持规格字段：" + key)
			}
		}
		if existing, exists := selector[key]; exists && existing != value {
			return nil, "", 0, BadAuthRequest("价格档存在重复规格条件：" + key)
		}
		selector[key] = value
	}
	if capability == "video" {
		if _, exists := selector["vquality"]; !exists {
			if resolution := normalizeChannelModelTierResolution(input.Resolution); resolution != "*" {
				selector["vquality"] = resolution
			}
		}
		if _, exists := selector["videoSeconds"]; !exists && input.VideoSeconds > 0 {
			selector["videoSeconds"] = strconv.Itoa(input.VideoSeconds)
		}
	} else if input.Resolution != "" && normalizeChannelModelTierResolution(input.Resolution) != "*" {
		return nil, "", 0, BadAuthRequest("非视频模型不能使用视频分辨率价格档")
	} else if input.VideoSeconds != 0 {
		return nil, "", 0, BadAuthRequest("非视频模型不能使用视频时长价格档")
	}
	for _, key := range []string{"quality", "size"} {
		if _, exists := selector[key]; exists && capability != "image" {
			return nil, "", 0, BadAuthRequest("只有图片模型可以按 " + key + " 配置价格档")
		}
	}
	if _, exists := selector["vquality"]; exists && capability != "video" {
		return nil, "", 0, BadAuthRequest("只有视频模型可以按分辨率配置价格档")
	}
	if _, exists := selector["resolution"]; exists && capability != "image" {
		return nil, "", 0, BadAuthRequest("只有图片模型可以按分辨率配置价格档")
	}
	if _, exists := selector["videoSeconds"]; exists && capability != "video" {
		return nil, "", 0, BadAuthRequest("只有视频模型可以按时长配置价格档")
	}
	if _, exists := selector["imageCount"]; exists && capability != "video" {
		return nil, "", 0, BadAuthRequest("只有视频模型可以按参考图片数量配置价格档")
	}
	resolution := "*"
	if value := selector["vquality"]; value != "" {
		resolution = value
	}
	// 旧列只作回显兜底：区间档存下限，任意时长档存 0。
	videoSeconds := 0
	if value := selector["videoSeconds"]; value != "" {
		if low, _, ok := parseVideoSecondsSelector(value); ok {
			videoSeconds = low
		}
	}
	return selector, resolution, videoSeconds, nil
}

func validateChannelModelTierPricing(capability string, protocol model.ChannelInterfaceType, billingMode string, input ChannelModelPriceTierRequest) error {
	if err := validateCreditCostPricing(capability, billingMode, input.CostPricing); err != nil {
		return err
	}
	if billingMode == imagebilling.Mode {
		if capability != "image" {
			return BadAuthRequest("图片用量计费仅适用于图片模型")
		}
		if err := imagebilling.Validate(input.ImagePricing); err != nil {
			return BadAuthRequest(err.Error())
		}
	} else if input.ImagePricing != nil {
		return BadAuthRequest("图片用量价格仅用于图片用量计费模式")
	}
	if billingMode != "fixed_request" && billingMode != "per_second" && billingMode != "token" && billingMode != imagebilling.Mode {
		return BadAuthRequest("模型计费方式仅支持按次、按秒、Token 或图片用量")
	}
	if billingMode == "per_second" && capability != "video" && capability != "audio" {
		return BadAuthRequest("只有视频或音频模型可以按秒计费")
	}
	if billingMode == "token" && !supportsTokenBilling(capability, protocol) {
		return BadAuthRequest("Token 计费仅支持文本、视频和 EvoLink Qwen TTS 音频模型")
	}
	if input.UnitPriceMicrocredits < 0 || input.InputTokenPriceMicrocredits < 0 || input.OutputTokenPriceMicrocredits < 0 || input.CachedTokenPriceMicrocredits < 0 || input.CacheWriteTokenPriceMicrocredits < 0 ||
		input.ReferenceVideoUnitPriceMicrocredits < 0 || input.ReferenceVideoOutputTokenPriceMicrocredits < 0 ||
		input.ReferenceImageUnitPriceMicrocredits < 0 || input.CostPricing.ReferenceImageUnitPriceMicrocredits < 0 {
		return BadAuthRequest("模型积分价格不能小于 0")
	}
	if input.FreeReferenceImages < 0 || input.FreeReferenceImages > 128 || input.CostPricing.FreeReferenceImages < 0 || input.CostPricing.FreeReferenceImages > 128 {
		return BadAuthRequest("免费参考图张数必须在 0 到 128 之间")
	}
	if capability != "video" && (input.ReferenceVideoUnitPriceMicrocredits != 0 || input.ReferenceVideoOutputTokenPriceMicrocredits != 0 ||
		input.CostPricing.ReferenceVideoUnitPriceMicrocredits != 0 || input.CostPricing.ReferenceVideoOutputTokenPriceMicrocredits != 0) {
		return BadAuthRequest("只有视频模型可以配置带参考视频的价格")
	}
	if capability != "video" && (input.ReferenceImageUnitPriceMicrocredits != 0 || input.FreeReferenceImages != 0 ||
		input.CostPricing.ReferenceImageUnitPriceMicrocredits != 0 || input.CostPricing.FreeReferenceImages != 0) {
		return BadAuthRequest("只有视频模型可以配置参考图计费")
	}
	if billingMode == "token" {
		return validateTokenPrices(capability, input.InputTokenPriceMicrocredits, input.OutputTokenPriceMicrocredits, input.CachedTokenPriceMicrocredits, input.CacheWriteTokenPriceMicrocredits)
	}
	return validateTokenPrices("", input.InputTokenPriceMicrocredits, input.OutputTokenPriceMicrocredits, input.CachedTokenPriceMicrocredits, input.CacheWriteTokenPriceMicrocredits)
}

func normalizeChannelModelTierResolution(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" || value == "*" || strings.EqualFold(value, "any") {
		return "*"
	}
	normalized := normalizeModelRequestOption("vquality", value)
	return strings.ToLower(strings.TrimSpace(fmt.Sprint(normalized)))
}

func (s *Service) applyChannelModelPriceTierSummary(item *model.ChannelModel, tiers []model.ChannelModelPriceTier) {
	item.PriceConfigured = false
	item.BillingMode = "fixed_request"
	item.UnitPriceMicrocredits = 0
	item.InputTokenPriceMicrocredits = 0
	item.OutputTokenPriceMicrocredits = 0
	item.CachedTokenPriceMicrocredits = 0
	item.CacheWriteTokenPriceMicrocredits = 0
	var summary *model.ChannelModelPriceTier
	for index := range tiers {
		tier := &tiers[index]
		if tier.Enabled && tier.PriceConfigured {
			item.PriceConfigured = true
		}
		if summary == nil || (tier.Resolution == "*" && tier.VideoSeconds == 0) {
			summary = tier
		}
	}
	if summary == nil {
		return
	}
	item.BillingMode = summary.BillingMode
	item.UnitPriceMicrocredits = summary.UnitPriceMicrocredits
	item.InputTokenPriceMicrocredits = summary.InputTokenPriceMicrocredits
	item.OutputTokenPriceMicrocredits = summary.OutputTokenPriceMicrocredits
	item.CachedTokenPriceMicrocredits = summary.CachedTokenPriceMicrocredits
	item.CacheWriteTokenPriceMicrocredits = summary.CacheWriteTokenPriceMicrocredits
}

// validateReferenceVideoTierPrices 要求开启参考视频计费的模型为每个已启用的收费按秒 / Token 档
// 配置带参考视频的价格，避免挂参考视频的请求按 0 价格结算。
func validateReferenceVideoTierPrices(enabled bool, tiers []model.ChannelModelPriceTier) error {
	if !enabled {
		return nil
	}
	for _, tier := range tiers {
		if !tier.Enabled || !tier.PriceConfigured {
			continue
		}
		if tier.BillingMode == "per_second" && tier.UnitPriceMicrocredits > 0 && tier.ReferenceVideoUnitPriceMicrocredits == 0 {
			return BadAuthRequest("已开启参考视频计费，请为按秒价格档配置带参考视频的每秒价格")
		}
		if tier.BillingMode == "token" && tier.OutputTokenPriceMicrocredits > 0 && tier.ReferenceVideoOutputTokenPriceMicrocredits == 0 {
			return BadAuthRequest("已开启参考视频计费，请为 Token 价格档配置带参考视频的 Token 价格")
		}
		// 成本价同样分两套：配置了成本的档必须填写带参考视频成本价，否则挂参考视频的订单会记成 0 成本。
		cost := tier.CostPricing
		if !cost.Configured {
			continue
		}
		if tier.BillingMode == "per_second" && cost.UnitPriceMicrocredits > 0 && cost.ReferenceVideoUnitPriceMicrocredits == 0 {
			return BadAuthRequest("已开启参考视频计费，请为按秒价格档配置带参考视频的每秒成本价")
		}
		if tier.BillingMode == "token" && cost.OutputTokenPriceMicrocredits > 0 && cost.ReferenceVideoOutputTokenPriceMicrocredits == 0 {
			return BadAuthRequest("已开启参考视频计费，请为 Token 价格档配置带参考视频的 Token 成本价")
		}
	}
	return nil
}
