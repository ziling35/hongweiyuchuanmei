package app

import (
	"strings"
	"testing"

	"gorm.io/gorm"

	"yingce/backend/internal/model"
)

// newReferenceImageFixture 把视频报价夹具收敛成单个价格档，便于断言参考图加项。
func newReferenceImageFixture(t *testing.T, updates map[string]any) (*Service, *gorm.DB, model.ModelChannel, model.ChannelModel) {
	t.Helper()
	svc, db, channel, channelModel, _ := newVideoTokenQuoteFixture(t)
	if err := db.Where("channel_model_id = ? AND id = ?", channelModel.ID, "video-silent").Delete(&model.ChannelModelPriceTier{}).Error; err != nil {
		t.Fatal(err)
	}
	fields := map[string]any{"selector_key": "{}", "selector_json": "{}", "resolution": "*", "video_seconds": 0}
	for key, value := range updates {
		fields[key] = value
	}
	if err := db.Model(&model.ChannelModelPriceTier{}).Where("id = ?", "video-audio").Updates(fields).Error; err != nil {
		t.Fatal(err)
	}
	return svc, db, channel, channelModel
}

func referenceImageOrder(t *testing.T, svc *Service, channel model.ModelChannel, channelModel model.ChannelModel, images int) (*model.BillingOrder, error) {
	t.Helper()
	intent := ModelRequestIntent{
		Capability: "video",
		Inputs:     map[string]int{"image": images},
		Options:    map[string]any{"vquality": "720p", "size": "16:9", "videoSeconds": 5},
	}
	return svc.newBillingOrderWithPriceTier("quote-user", "task", "reference-image", channel.ID, channelModel.ModelKey, "video", "test", 5, tokenBillingEstimate{}, "", intent)
}

func TestReferenceImageBillingChargesImagesBeyondFreeQuota(t *testing.T) {
	svc, _, channel, channelModel := newReferenceImageFixture(t, map[string]any{
		"billing_mode": "per_second", "unit_price_microcredits": 1_000_000, "output_token_price_microcredits": 0,
		"reference_image_unit_price_microcredits": 3_000_000, "free_reference_images": 1,
	})
	order, err := referenceImageOrder(t, svc, channel, channelModel, 4)
	if err != nil {
		t.Fatal(err)
	}
	// 5 秒 × 1 积分 + 超出免费额度的 3 张 × 3 积分 = 14 积分。
	if order.Quantity != 5 || order.AmountMicrocredits != 14_000_000 || order.ReferenceImageAmountMicrocredits != 9_000_000 {
		t.Fatalf("order = quantity %d amount %d imageAmount %d", order.Quantity, order.AmountMicrocredits, order.ReferenceImageAmountMicrocredits)
	}
	if order.ReferenceImages != 4 || order.ReferenceImageBilledImages != 3 || order.FreeReferenceImages != 1 || order.ReferenceImageUnitPriceMicrocredits != 3_000_000 {
		t.Fatalf("reference image snapshot = %#v", order)
	}
}

func TestReferenceImageBillingWithinFreeQuotaIsFree(t *testing.T) {
	svc, _, channel, channelModel := newReferenceImageFixture(t, map[string]any{
		"billing_mode": "per_second", "unit_price_microcredits": 1_000_000, "output_token_price_microcredits": 0,
		"reference_image_unit_price_microcredits": 3_000_000, "free_reference_images": 2,
	})
	order, err := referenceImageOrder(t, svc, channel, channelModel, 2)
	if err != nil {
		t.Fatal(err)
	}
	if order.AmountMicrocredits != 5_000_000 || order.ReferenceImageAmountMicrocredits != 0 || order.ReferenceImageBilledImages != 0 {
		t.Fatalf("免费额度以内必须只收输出侧费用，got %#v", order)
	}
	if order.ReferenceImages != 2 || order.FreeReferenceImages != 2 {
		t.Fatalf("reference image snapshot = %#v", order)
	}
}

func TestReferenceImageBillingDisabledByZeroPrice(t *testing.T) {
	svc, _, channel, channelModel := newReferenceImageFixture(t, map[string]any{
		"billing_mode": "per_second", "unit_price_microcredits": 1_000_000, "output_token_price_microcredits": 0,
		"reference_image_unit_price_microcredits": 0, "free_reference_images": 0,
	})
	order, err := referenceImageOrder(t, svc, channel, channelModel, 3)
	if err != nil {
		t.Fatal(err)
	}
	if order.AmountMicrocredits != 5_000_000 || order.ReferenceImageAmountMicrocredits != 0 || order.ReferenceImageBilledImages != 0 {
		t.Fatalf("参考图单价为 0 时不应计费，got %#v", order)
	}
}

func TestTokenVideoQuoteAddsReferenceImageFee(t *testing.T) {
	svc, db, channel, channelModel := newReferenceImageFixture(t, map[string]any{
		"billing_mode": "token", "unit_price_microcredits": 0, "output_token_price_microcredits": 16_000_000,
		"reference_image_unit_price_microcredits": 2_000_000, "free_reference_images": 1,
	})
	intent := ModelRequestIntent{
		Capability: "video",
		Inputs:     map[string]int{"image": 3},
		Options:    map[string]any{"vquality": "720p", "size": "16:9", "videoSeconds": 5, "videoGenerateAudio": true},
	}
	quote, err := svc.QuoteChannelModel(testGroupUserID(svc), ChannelModelQuoteRequest{ChannelID: channel.ID, ModelKey: channelModel.ModelKey, Intent: intent})
	if err != nil {
		t.Fatal(err)
	}
	// 118800 Token × 16 积分/百万 = 1.9008 积分，再加 2 张计费参考图 × 2 积分。
	if quote.AmountMicrocredits != 5_900_800 {
		t.Fatalf("quote amount = %d, want 5900800", quote.AmountMicrocredits)
	}
	if quote.ReferenceImages == nil || quote.ReferenceImages.Count != 3 || quote.ReferenceImages.FreeImages != 1 ||
		quote.ReferenceImages.BilledImages != 2 || quote.ReferenceImages.AmountMicrocredits != 4_000_000 {
		t.Fatalf("reference images quote = %#v", quote.ReferenceImages)
	}
	assertVideoQuoteHasNoFinancialWrites(t, db)
}

func TestReferenceImagePricingRejectedForNonVideoModel(t *testing.T) {
	request := ChannelModelPriceTierRequest{UnitPriceMicrocredits: 1_000_000, ReferenceImageUnitPriceMicrocredits: 1_000_000}
	err := validateChannelModelTierPricing("image", model.ChannelInterfaceVolcengineArkImage, "fixed_request", request)
	if err == nil || !strings.Contains(err.Error(), "参考图计费") {
		t.Fatalf("非视频模型必须拒绝参考图计费，got %v", err)
	}
	if err := validateChannelModelTierPricing("video", model.ChannelInterfaceVolcengineArkVideo, "fixed_request", request); err != nil {
		t.Fatalf("视频模型应接受参考图计费：%v", err)
	}
	request.FreeReferenceImages = 129
	if err := validateChannelModelTierPricing("video", model.ChannelInterfaceVolcengineArkVideo, "fixed_request", request); err == nil || !strings.Contains(err.Error(), "免费参考图张数") {
		t.Fatalf("免费张数超范围必须拒绝，got %v", err)
	}
}

func TestReferenceImageChargeMath(t *testing.T) {
	cases := []struct {
		name                        string
		unit, images                int64
		free                        int32
		bps, wantBilled, wantAmount int64
	}{
		{name: "超出免费额度", unit: 3_000_000, images: 4, free: 1, bps: 10_000, wantBilled: 3, wantAmount: 9_000_000},
		{name: "刚好在免费额度内", unit: 3_000_000, images: 2, free: 2, bps: 10_000},
		{name: "单价为 0 不计费", unit: 0, images: 5, bps: 10_000},
		{name: "没有参考图", unit: 3_000_000, bps: 10_000},
		{name: "倍率向上取整", unit: 1_500_000, images: 1, bps: 12_345, wantBilled: 1, wantAmount: 1_851_750},
	}
	for _, testCase := range cases {
		billed, amount, err := referenceImageCharge(testCase.unit, testCase.images, testCase.free, testCase.bps)
		if err != nil {
			t.Fatalf("%s: err = %v", testCase.name, err)
		}
		if billed != testCase.wantBilled || amount != testCase.wantAmount {
			t.Fatalf("%s: billed = %d amount = %d, want %d / %d", testCase.name, billed, amount, testCase.wantBilled, testCase.wantAmount)
		}
	}
}
