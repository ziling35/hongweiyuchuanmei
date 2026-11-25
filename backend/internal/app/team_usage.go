package app

import (
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

const (
	teamUsageDefaultDays = 30
	teamUsageMaxDays     = 366
)

// normalizeTeamUsageRange 把请求的时间范围收敛成 [from, to)：缺省最近 30 天，
// 结束时间不晚于当前，起点必须早于终点，单次最多查询一年。
func normalizeTeamUsageRange(from, to, now time.Time) (time.Time, time.Time, error) {
	if to.IsZero() || to.After(now) {
		to = now
	}
	if from.IsZero() {
		from = to.AddDate(0, 0, -teamUsageDefaultDays)
	}
	if !from.Before(to) {
		return time.Time{}, time.Time{}, BadAuthRequest("开始时间必须早于结束时间")
	}
	if to.Sub(from) > teamUsageMaxDays*24*time.Hour {
		return time.Time{}, time.Time{}, BadAuthRequest("用量报表单次最多查询 366 天")
	}
	return from, to, nil
}

// TeamUsageReport 返回团队积分在生产上的消耗报表。
// 所有者看全员用量；普通成员只能看自己的消耗（团队池与其他人余额仍然不可见）。
func (s *Service) TeamUsageReport(userID, teamID string, from, to time.Time) (*repository.TeamUsageReport, error) {
	if err := s.RequireFeature(FeatureTeams); err != nil {
		return nil, err
	}
	if err := s.RequireFeature(FeatureCredits); err != nil {
		return nil, err
	}
	member, err := s.requireTeamMember(userID, teamID, false)
	if err != nil {
		return nil, err
	}
	scope := ""
	if member.Role != model.TeamOwner {
		scope = member.ID
	}
	from, to, err = normalizeTeamUsageRange(from, to, time.Now())
	if err != nil {
		return nil, err
	}
	return s.repo.TeamUsageReport(teamID, scope, from, to)
}
