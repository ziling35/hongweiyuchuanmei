package app

import (
	"testing"
	"time"
)

func TestNormalizeTeamUsageRange(t *testing.T) {
	now := time.Date(2026, 3, 20, 12, 0, 0, 0, time.UTC)
	from, to, err := normalizeTeamUsageRange(time.Time{}, time.Time{}, now)
	if err != nil {
		t.Fatal(err)
	}
	if !to.Equal(now) || to.Sub(from) != 30*24*time.Hour {
		t.Fatalf("默认区间错误: %v → %v", from, to)
	}
	// 结束时间晚于现在时收到现在。
	_, to, err = normalizeTeamUsageRange(now.AddDate(0, 0, -7), now.AddDate(0, 0, 30), now)
	if err != nil || !to.Equal(now) {
		t.Fatalf("未来结束时间未被收敛: %v %v", to, err)
	}
	if _, _, err := normalizeTeamUsageRange(now, now, now); err == nil {
		t.Fatal("零长度区间被接受")
	}
	if _, _, err := normalizeTeamUsageRange(now.AddDate(-2, 0, 0), now, now); err == nil {
		t.Fatal("超过一年的区间被接受")
	}
	if from, to, err := normalizeTeamUsageRange(now.AddDate(0, 0, -90), now, now); err != nil || to.Sub(from) != 90*24*time.Hour {
		t.Fatalf("90 天区间被拒绝: %v %v %v", from, to, err)
	}
}
