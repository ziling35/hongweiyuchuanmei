package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

const creditPolicySettingKey = "credit_policy"

// 视频 Token 预授权的默认与上限比例（万分比）。
const (
	defaultVideoReserveMarginBPS = int64(1000)
	maxVideoReserveMarginBPS     = int64(5_000)
)

type CreditPolicy struct {
	SignupBonusMicrocredits  int64            `json:"signupBonusMicrocredits"`
	CheckinBonusMicrocredits int64            `json:"checkinBonusMicrocredits"`
	DefaultMultiplierBPS     int64            `json:"defaultMultiplierBasisPoints"`
	ModelMultiplierBPS       map[string]int64 `json:"modelMultiplierBasisPoints"`
	// 视频 Token 预授权的预留比例（万分比，1000 = 10%）；0 表示不再额外预留。
	VideoReserveMarginBPS int64 `json:"videoReserveMarginBasisPoints"`
}

type PublicCreditPolicy struct {
	SignupBonusMicrocredits  int64 `json:"signupBonusMicrocredits"`
	CheckinBonusMicrocredits int64 `json:"checkinBonusMicrocredits"`
	CheckedInToday           bool  `json:"checkedInToday"`
}

func defaultCreditPolicy() CreditPolicy {
	return CreditPolicy{SignupBonusMicrocredits: 0, CheckinBonusMicrocredits: 0, DefaultMultiplierBPS: 10_000, VideoReserveMarginBPS: defaultVideoReserveMarginBPS, ModelMultiplierBPS: map[string]int64{}}
}

func validateCreditPolicy(policy CreditPolicy) error {
	if policy.SignupBonusMicrocredits < 0 || policy.CheckinBonusMicrocredits < 0 {
		return BadAuthRequest("注册和签到奖励不能小于 0")
	}
	if policy.SignupBonusMicrocredits > 1_000_000*CreditScale || policy.CheckinBonusMicrocredits > 100_000*CreditScale {
		return BadAuthRequest("积分奖励超出允许范围")
	}
	if policy.DefaultMultiplierBPS <= 0 || policy.DefaultMultiplierBPS > 1_000_000 {
		return BadAuthRequest("默认模型倍率必须在 0.0001-100 之间")
	}
	if policy.VideoReserveMarginBPS < 0 || policy.VideoReserveMarginBPS > maxVideoReserveMarginBPS {
		return BadAuthRequest("视频预授权预留比例必须在 0%-50% 之间")
	}
	for modelKey, multiplier := range policy.ModelMultiplierBPS {
		if strings.TrimSpace(modelKey) == "" || multiplier <= 0 || multiplier > 1_000_000 {
			return BadAuthRequest("模型倍率配置无效")
		}
	}
	return nil
}

// 积分策略直接读取数据库，避免关闭赠送后其他实例继续沿用旧额度。
func (s *Service) creditPolicy() (CreditPolicy, error) {
	setting, err := s.repo.SystemSetting(creditPolicySettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return defaultCreditPolicy(), nil
	}
	if err != nil {
		return CreditPolicy{}, err
	}
	var policy CreditPolicy
	if json.Unmarshal([]byte(setting.ValueJSON), &policy) != nil {
		return CreditPolicy{}, errors.New("积分策略配置格式无效")
	}
	// 老配置没有这个字段：按 BPS=0 直接解读等于"取消预留"，会静默改变现网扣费口径，
	// 因此只在键缺失时回落到默认 10%，显式保存的 0 仍然生效。
	var present map[string]json.RawMessage
	if json.Unmarshal([]byte(setting.ValueJSON), &present) == nil {
		if _, ok := present["videoReserveMarginBasisPoints"]; !ok {
			policy.VideoReserveMarginBPS = defaultVideoReserveMarginBPS
		}
	}
	if policy.ModelMultiplierBPS == nil {
		policy.ModelMultiplierBPS = map[string]int64{}
	}
	if err := validateCreditPolicy(policy); err != nil {
		return CreditPolicy{}, err
	}
	return policy, nil
}

func (s *Service) AdminCreditPolicy(actor *model.User) (CreditPolicy, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return CreditPolicy{}, err
	}
	return s.creditPolicy()
}

func (s *Service) UpdateCreditPolicy(actor *model.User, policy CreditPolicy) (CreditPolicy, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return CreditPolicy{}, err
	}
	if policy.ModelMultiplierBPS == nil {
		policy.ModelMultiplierBPS = map[string]int64{}
	}
	if err := validateCreditPolicy(policy); err != nil {
		return CreditPolicy{}, err
	}
	encoded, err := json.Marshal(policy)
	if err != nil {
		return CreditPolicy{}, err
	}
	setting := model.SystemSetting{Key: creditPolicySettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	current, err := s.repo.SystemSetting(creditPolicySettingKey)
	if err == nil {
		setting.CreatedAt = current.CreatedAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return CreditPolicy{}, err
	}
	if err := s.repo.SaveSystemSetting(&setting); err != nil {
		return CreditPolicy{}, err
	}
	if err := s.appendAdminAudit(actor, "credit_policy.update", "system_setting", creditPolicySettingKey, "更新积分策略", policy); err != nil {
		return CreditPolicy{}, err
	}
	return policy, nil
}

func (s *Service) ensureSignupBonus(userID string) error {
	enabled, err := s.FeatureEnabled(FeatureCredits)
	if err != nil || !enabled {
		return err
	}
	policy, err := s.creditPolicy()
	if err != nil || policy.SignupBonusMicrocredits == 0 {
		return err
	}
	_, _, err = s.repo.GrantCreditsOnce(userID, model.CreditLedgerSignupBonus, policy.SignupBonusMicrocredits, "signup:"+userID, "新用户默认积分")
	return err
}

func (s *Service) CheckinCredits(user *model.User) (*model.CreditAccount, bool, error) {
	if user == nil {
		return nil, false, Unauthorized("请先登录")
	}
	if err := s.RequireFeature(FeatureCredits); err != nil {
		return nil, false, err
	}
	policy, err := s.creditPolicy()
	if err != nil {
		return nil, false, err
	}
	if policy.CheckinBonusMicrocredits == 0 {
		return nil, false, BadAuthRequest("当前未开启签到奖励")
	}
	day := time.Now().UTC().Format("2006-01-02")
	return s.repo.GrantCreditsOnce(user.ID, model.CreditLedgerCheckinBonus, policy.CheckinBonusMicrocredits, "checkin:"+user.ID+":"+day, "每日签到奖励")
}

func (s *Service) publicCreditPolicy(userID string) (PublicCreditPolicy, error) {
	policy, err := s.creditPolicy()
	if err != nil {
		return PublicCreditPolicy{}, err
	}
	reference := "checkin:" + userID + ":" + time.Now().UTC().Format("2006-01-02")
	checked, err := s.repo.CreditLedgerReferenceExists(reference)
	return PublicCreditPolicy{SignupBonusMicrocredits: policy.SignupBonusMicrocredits, CheckinBonusMicrocredits: policy.CheckinBonusMicrocredits, CheckedInToday: checked}, err
}

// 单价、数量和倍率全程使用整数并向上取整，避免浮点误差造成少扣积分。
func creditAmount(unitPrice int64, quantity int64, multiplierBPS int64) (int64, error) {
	if unitPrice < 0 || quantity <= 0 || multiplierBPS <= 0 {
		return 0, errors.New("积分计费参数无效")
	}
	if unitPrice > (1<<63-1)/quantity {
		return 0, errors.New("积分计费金额溢出")
	}
	base := unitPrice * quantity
	if base > ((1<<63-1)-9_999)/multiplierBPS {
		return 0, errors.New("积分计费金额溢出")
	}
	amount := (base*multiplierBPS + 9_999) / 10_000
	if amount < 0 {
		return 0, fmt.Errorf("积分计费金额无效：%d", amount)
	}
	return amount, nil
}

// tokensWithPolicyMargin 用后台积分策略里的视频预留比例估算 Token。
// 报价与建单必须走同一条路径，否则用户看到的"额外预留"和实际冻结会不一致。
func (s *Service) tokensWithPolicyMargin(input map[string]any, capability string) tokenBillingEstimate {
	return estimateTaskBillingTokensWithMargin(input, capability, s.videoReserveMarginBPS())
}

func (s *Service) videoReserveMarginBPS() int64 {
	policy, err := s.creditPolicy()
	if err != nil {
		return defaultVideoReserveMarginBPS
	}
	return policy.VideoReserveMarginBPS
}
