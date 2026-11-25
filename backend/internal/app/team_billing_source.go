package app

import (
	"net/http"

	"yingce/backend/internal/model"
)

// applyTeamBillingAccount 把个人空间任务的扣费账户切到成员自己的团队额度。
//
// 只换扣费账户：任务、产物、存储配额仍然属于个人空间，公共池一分钱都动不到，
// 可花上限就是团长划给该成员的那部分余额。团队额度不允许配成员自己的渠道密钥，
// 否则等于用团队的钱跑个人的渠道，账目与风控都说不清。
func (s *Service) applyTeamBillingAccount(userID string, order *model.BillingOrder, membershipID string, input map[string]any) error {
	if order == nil || order.TeamID != "" {
		return BadAuthRequest("本次生成不能指定团队额度")
	}
	if err := s.RequireFeature(FeatureTeams); err != nil {
		return err
	}
	if err := s.RequireFeature(FeatureCredits); err != nil {
		return err
	}
	if taskInputUsesCustomChannel(input) || taskInputUsesWorkflowProvider(input) {
		return BadAuthRequest("团队额度只能用于系统模型，请改用个人余额或选择系统模型")
	}
	member, err := s.repo.TeamMemberForUserByID(userID, membershipID)
	if err != nil {
		return teamError(http.StatusForbidden, "team_access_denied", "该团队额度不属于当前账号或已失效")
	}
	team, err := s.repo.TeamForUser(member.TeamID, userID)
	if err != nil {
		return teamNotFound(err)
	}
	if team.Team.Status != model.TeamActive {
		return teamError(http.StatusForbidden, "team_access_denied", "该团队已停止使用")
	}
	accountID := model.TeamMemberCreditAccountID(member.ID)
	account, err := s.repo.CreditAccountByID(accountID)
	if err != nil || account.TeamID != member.TeamID {
		return teamError(http.StatusConflict, "team_credits_unavailable", "团队额度账户不存在，请联系团队所有者")
	}
	order.TeamID = member.TeamID
	order.MembershipID = member.ID
	order.BillingAccountID = accountID
	// 冻结额就是这次生成的上限：结算按实际用量退差，超出不会追加扣款。
	order.ChargeLimitSet = true
	order.ChargeLimitMicrocredits = order.AmountMicrocredits
	return nil
}
