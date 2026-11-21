package handler

import (
	"errors"
	"net/http"
	"strconv"

	"yingce/backend/internal/model"
	"yingce/backend/internal/service"

	"github.com/gin-gonic/gin"
)

// 画布快照比普通 JSON 大得多，单独放宽到 4MB，避免正常作品被判超限。
const showcaseSnapshotMaxBytes = 4 << 20

// failShowcase 把作品广场的领域错误映射成 HTTP 状态；其余交给统一的 failService。
func failShowcase(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrShowcaseInvalidInput):
		fail(c, http.StatusBadRequest, err)
	case errors.Is(err, service.ErrShowcaseNotFound):
		fail(c, http.StatusNotFound, err)
	case errors.Is(err, service.ErrShowcaseForbidden):
		fail(c, http.StatusForbidden, err)
	case errors.Is(err, service.ErrShowcaseDuplicate), errors.Is(err, service.ErrShowcaseCategoryInUse):
		fail(c, http.StatusConflict, err)
	default:
		failService(c, err)
	}
}

// optionalUser 用于「已上架作品人人可看、未上架只有作者可见」这类接口：没登录不算错误。
func optionalUser(c *gin.Context, svc *service.Service) *model.User {
	user, err := currentUser(c, svc)
	if err != nil {
		return nil
	}
	return user
}

// RegisterShowcaseRoutes 注册作品广场：公开列表与分类匿名可读，提交/修改/撤下要登录，
// 分类维护与审核只有管理员能用。
func RegisterShowcaseRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/showcase/categories", func(c *gin.Context) {
		items, err := svc.ShowcaseCategories(false)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"categories": items})
	})

	r.GET("/showcase/works", func(c *gin.Context) {
		categoryID := uint(0)
		if raw := c.Query("categoryId"); raw != "" {
			parsed, err := strconv.ParseUint(raw, 10, 32)
			if err != nil {
				fail(c, http.StatusBadRequest, errors.New("categoryId 不合法"))
				return
			}
			categoryID = uint(parsed)
		}
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "24"))
		result, err := svc.PublicShowcaseWorks(categoryID, page, pageSize)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, result)
	})

	// 查看制作过程 / 复制项目都读这份快照。
	r.GET("/showcase/works/:id/canvas", func(c *gin.Context) {
		payload, err := svc.ShowcaseWorkCanvas(c.Param("id"), optionalUser(c, svc))
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, payload)
	})

	r.GET("/showcase/mine", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		items, err := svc.MyShowcaseWorks(user)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"items": items})
	})

	r.POST("/showcase/works", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, showcaseSnapshotMaxBytes)
		var input service.ShowcaseWorkInput
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		item, err := svc.SubmitShowcaseWork(user, input)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"work": item})
	})

	r.PATCH("/showcase/works/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, showcaseSnapshotMaxBytes)
		var input service.ShowcaseWorkInput
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		item, err := svc.UpdateShowcaseWork(user, c.Param("id"), input)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"work": item})
	})

	r.DELETE("/showcase/works/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.WithdrawShowcaseWork(user, c.Param("id")); err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	})

	// ---------- 管理员：分类 ----------

	r.GET("/admin/showcase/categories", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		// 后台需要看到停用的分类；权限由 Create/Update/Delete 统一校验，这里额外校验一次读权限。
		if err := svc.RequireAdmin(user); err != nil {
			failService(c, err)
			return
		}
		items, err := svc.ShowcaseCategories(true)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"categories": items})
	})

	r.POST("/admin/showcase/categories", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input service.ShowcaseCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		item, err := svc.CreateShowcaseCategory(user, input)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"category": item})
	})

	r.PATCH("/admin/showcase/categories/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		id, err := strconv.ParseUint(c.Param("id"), 10, 32)
		if err != nil {
			fail(c, http.StatusBadRequest, errors.New("分类 id 不合法"))
			return
		}
		var input service.ShowcaseCategoryInput
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		item, err := svc.UpdateShowcaseCategory(user, uint(id), input)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"category": item})
	})

	r.DELETE("/admin/showcase/categories/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		id, err := strconv.ParseUint(c.Param("id"), 10, 32)
		if err != nil {
			fail(c, http.StatusBadRequest, errors.New("分类 id 不合法"))
			return
		}
		if err := svc.DeleteShowcaseCategory(user, uint(id)); err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"deleted": true})
	})

	// ---------- 管理员：作品审核 ----------

	r.GET("/admin/showcase/works", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
		items, total, err := svc.AdminShowcaseWorks(user, c.DefaultQuery("status", "all"), page, pageSize)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"items": items, "total": total})
	})

	r.POST("/admin/showcase/works/:id/review", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input struct {
			Approve bool   `json:"approve"`
			Note    string `json:"note"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		item, err := svc.ReviewShowcaseWork(user, c.Param("id"), input.Approve, input.Note)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"work": item})
	})

	r.PATCH("/admin/showcase/works/:id/status", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var input struct {
			Status string `json:"status"`
		}
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		item, err := svc.SetShowcaseWorkStatus(user, c.Param("id"), input.Status)
		if err != nil {
			failShowcase(c, err)
			return
		}
		ok(c, gin.H{"work": item})
	})
}
