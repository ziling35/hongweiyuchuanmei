package repository

import (
	"time"

	"gorm.io/gorm"
)

// 团队用量报表只读 billing_orders 的结算快照：已结算订单取实际金额，进行中的订单取冻结额。
// 团队空间内的任务和个人空间里用团队额度生成的任务都会落在这张表上（都带 team_id/membership_id）。
const teamUsageSpentExpr = "CASE WHEN o.status = 'settled' THEN o.actual_amount_microcredits ELSE 0 END"
const teamUsageReservedExpr = "CASE WHEN o.status IN ('reserved','running','uncertain') THEN o.reserved_amount_microcredits ELSE 0 END"
const teamUsageCountExpr = "CASE WHEN o.status IN ('settled','reserved','running','uncertain') THEN o.id END"

type TeamUsageTotals struct {
	SpentMicrocredits    int64 `json:"spentMicrocredits"`
	ReservedMicrocredits int64 `json:"reservedMicrocredits"`
	OrderCount           int64 `json:"orderCount"`
}

type TeamUsageMember struct {
	MembershipID         string `json:"membershipId"`
	UserID               string `json:"userId"`
	Username             string `json:"username"`
	DisplayName          string `json:"displayName"`
	Role                 string `json:"role"`
	Status               string `json:"status"`
	SpentMicrocredits    int64  `json:"spentMicrocredits"`
	ReservedMicrocredits int64  `json:"reservedMicrocredits"`
	OrderCount           int64  `json:"orderCount"`
}

type TeamUsageBreakdown struct {
	Key               string `json:"key"`
	SpentMicrocredits int64  `json:"spentMicrocredits"`
	OrderCount        int64  `json:"orderCount"`
}

type TeamUsageDay struct {
	Day               string `json:"day"`
	SpentMicrocredits int64  `json:"spentMicrocredits"`
	OrderCount        int64  `json:"orderCount"`
}

type TeamUsageReport struct {
	From         string               `json:"from"`
	To           string               `json:"to"`
	Totals       TeamUsageTotals      `json:"totals"`
	Members      []TeamUsageMember    `json:"members"`
	Capabilities []TeamUsageBreakdown `json:"capabilities"`
	Models       []TeamUsageBreakdown `json:"models"`
	Days         []TeamUsageDay       `json:"days"`
}

// TeamUsageReport 聚合 [from, to) 区间内该团队（或指定成员）的积分消耗。
// membershipID 非空时只统计该成员，用于普通成员只查看自己的用量。
func (r *Repository) TeamUsageReport(teamID, membershipID string, from, to time.Time) (*TeamUsageReport, error) {
	report := &TeamUsageReport{
		From:         from.UTC().Format(time.RFC3339),
		To:           to.UTC().Format(time.RFC3339),
		Members:      []TeamUsageMember{},
		Capabilities: []TeamUsageBreakdown{},
		Models:       []TeamUsageBreakdown{},
		Days:         []TeamUsageDay{},
	}
	orderBase := func() *gorm.DB {
		query := r.db.Table("billing_orders AS o").Where("o.team_id = ? AND o.created_at >= ? AND o.created_at < ?", teamID, from, to)
		if membershipID != "" {
			query = query.Where("o.membership_id = ?", membershipID)
		}
		return query
	}
	var totals struct {
		Spent    int64
		Reserved int64
		Orders   int64
	}
	if err := orderBase().Select("COALESCE(SUM(" + teamUsageSpentExpr + "), 0) AS spent, COALESCE(SUM(" + teamUsageReservedExpr + "), 0) AS reserved, COUNT(" + teamUsageCountExpr + ") AS orders").Scan(&totals).Error; err != nil {
		return nil, err
	}
	report.Totals = TeamUsageTotals{SpentMicrocredits: totals.Spent, ReservedMicrocredits: totals.Reserved, OrderCount: totals.Orders}

	members := orderBase().
		Select("m.id AS membership_id, m.user_id, m.role, m.status, COALESCE(users.username, '') AS username, COALESCE(users.display_name, '') AS display_name, " +
			"COALESCE(SUM(" + teamUsageSpentExpr + "), 0) AS spent_microcredits, COALESCE(SUM(" + teamUsageReservedExpr + "), 0) AS reserved_microcredits, COUNT(" + teamUsageCountExpr + ") AS order_count").
		Joins("JOIN team_memberships AS m ON m.id = o.membership_id").
		Joins("LEFT JOIN users AS users ON users.id = m.user_id").
		Group("m.id, m.user_id, m.role, m.status, m.created_at, users.username, users.display_name").
		Order("spent_microcredits DESC, m.created_at").
		Scan(&report.Members)
	if members.Error != nil {
		return nil, members.Error
	}
	if report.Members == nil {
		report.Members = []TeamUsageMember{}
	}

	if err := orderBase().
		Select("o.capability AS key, COALESCE(SUM(" + teamUsageSpentExpr + "), 0) AS spent_microcredits, COUNT(" + teamUsageCountExpr + ") AS order_count").
		Where("o.capability <> ''").
		Group("o.capability").
		Order("spent_microcredits DESC").
		Scan(&report.Capabilities).Error; err != nil {
		return nil, err
	}
	if report.Capabilities == nil {
		report.Capabilities = []TeamUsageBreakdown{}
	}
	if err := orderBase().
		Select("o.model AS key, COALESCE(SUM(" + teamUsageSpentExpr + "), 0) AS spent_microcredits, COUNT(" + teamUsageCountExpr + ") AS order_count").
		Where("o.model <> ''").
		Group("o.model").
		Order("spent_microcredits DESC").
		Limit(12).
		Scan(&report.Models).Error; err != nil {
		return nil, err
	}
	if report.Models == nil {
		report.Models = []TeamUsageBreakdown{}
	}
	if err := orderBase().
		Select("DATE(o.created_at) AS day, COALESCE(SUM(" + teamUsageSpentExpr + "), 0) AS spent_microcredits, COUNT(" + teamUsageCountExpr + ") AS order_count").
		Group("DATE(o.created_at)").
		Order("day").
		Scan(&report.Days).Error; err != nil {
		return nil, err
	}
	if report.Days == nil {
		report.Days = []TeamUsageDay{}
	}
	return report, nil
}
