package repository

import (
	"testing"

	"yingce/backend/internal/model"
)

func TestTokenUsageAmountAddsReferenceImageFee(t *testing.T) {
	order := model.BillingOrder{
		Capability: "video", MultiplierBasisPoints: 10_000, OutputTokenPriceMicrocredits: 1_000_000,
		ReferenceImages: 3, FreeReferenceImages: 1, ReferenceImageBilledImages: 2,
		ReferenceImageUnitPriceMicrocredits: 2_000_000, ReferenceImageAmountMicrocredits: 4_000_000,
	}
	amount, rule, err := tokenUsageAmount(order, &BillingUsage{OutputTokens: 100_000})
	if err != nil || rule != 0 {
		t.Fatalf("tokenUsageAmount() error = %v rule = %d", err, rule)
	}
	// 100000 Token × 1 积分/百万 = 0.1 积分，加下单时锁定的参考图费用 4 积分。
	if amount != 4_100_000 {
		t.Fatalf("amount = %d, want 4100000", amount)
	}
}

func TestTokenUsageAmountRejectsNegativeReferenceImageFee(t *testing.T) {
	order := model.BillingOrder{
		Capability: "video", MultiplierBasisPoints: 10_000, OutputTokenPriceMicrocredits: 1_000_000,
		ReferenceImageAmountMicrocredits: -1,
	}
	if _, _, err := tokenUsageAmount(order, &BillingUsage{OutputTokens: 1_000}); err == nil {
		t.Fatal("负的参考图费用快照必须拒绝结算")
	}
}

func TestReferenceImageLedgerNoteDescribesQuota(t *testing.T) {
	cases := []struct {
		name  string
		order model.BillingOrder
		want  string
	}{
		{name: "未开启参考图计费", order: model.BillingOrder{ReferenceImages: 3}, want: ""},
		{name: "免费额度内", order: model.BillingOrder{ReferenceImages: 2, ReferenceImageUnitPriceMicrocredits: 1_000_000, FreeReferenceImages: 3}, want: "参考图 2 张未超出免费额度"},
		{name: "含免费张数", order: model.BillingOrder{ReferenceImages: 5, ReferenceImageUnitPriceMicrocredits: 1_000_000, FreeReferenceImages: 2, ReferenceImageBilledImages: 3}, want: "参考图 5 张（含免费 2 张），计费 3 张"},
		{name: "无免费张数", order: model.BillingOrder{ReferenceImages: 2, ReferenceImageUnitPriceMicrocredits: 1_000_000, ReferenceImageBilledImages: 2}, want: "参考图 2 张已计费"},
	}
	for _, testCase := range cases {
		if got := referenceImageLedgerNote(testCase.order); got != testCase.want {
			t.Fatalf("%s: note = %q, want %q", testCase.name, got, testCase.want)
		}
	}
}
