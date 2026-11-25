package handler

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

// parseTeamUsageTime 接受 RFC3339 或 YYYY-MM-DD，空值交给服务层套默认范围。
func parseTeamUsageTime(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, true
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, true
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return parsed, true
	}
	return time.Time{}, false
}

func registerTeamUsageRoutes(r *gin.RouterGroup, svc *service.Service) {
	group := r.Group("/teams/:teamId", RequireFeature(svc, service.FeatureCredits))
	group.GET("/usage", teamEndpoint(svc, func(c *gin.Context, userID string) (any, error) {
		from, ok := parseTeamUsageTime(c.Query("from"))
		if !ok {
			return nil, service.BadAuthRequest("开始时间格式无效，请使用 YYYY-MM-DD 或 RFC3339")
		}
		to, ok := parseTeamUsageTime(c.Query("to"))
		if !ok {
			return nil, service.BadAuthRequest("结束时间格式无效，请使用 YYYY-MM-DD 或 RFC3339")
		}
		return svc.TeamUsageReport(userID, c.Param("teamId"), from, to)
	}))
}
