package app

import (
	"yingce/backend/internal/model"
	"yingce/backend/internal/showcase"
)

type (
	ShowcaseCategory      = showcase.Category
	ShowcaseCategoryInput = showcase.CategoryInput
	ShowcaseWorkInput     = showcase.WorkInput
	ShowcaseWorkSummary   = showcase.WorkSummary
	ShowcasePublicPage    = showcase.PublicPage
	ShowcaseSnapshot      = showcase.SnapshotPayload
)

// 作品广场的领域错误统一从这里透出，handler 用 errors.Is 判定后映射 HTTP 状态。
var (
	ErrShowcaseInvalidInput  = showcase.ErrInvalidInput
	ErrShowcaseNotFound      = showcase.ErrNotFound
	ErrShowcaseForbidden     = showcase.ErrForbidden
	ErrShowcaseDuplicate     = showcase.ErrDuplicate
	ErrShowcaseCategoryInUse = showcase.ErrCategoryUnused
)

type showcaseAdminGate struct{ svc *Service }

func (g showcaseAdminGate) RequireAdmin(user *model.User) error {
	if g.svc == nil {
		return Unauthorized("请先登录")
	}
	return g.svc.RequireAdmin(user)
}

func (s *Service) showcaseDomain() *showcase.Service {
	return showcase.New(s.repo, showcaseAdminGate{svc: s})
}

// ---------- 分类 ----------

func (s *Service) ShowcaseCategories(includeDisabled bool) ([]ShowcaseCategory, error) {
	return s.showcaseDomain().ListCategories(includeDisabled)
}

func (s *Service) CreateShowcaseCategory(actor *model.User, input ShowcaseCategoryInput) (*ShowcaseCategory, error) {
	return s.showcaseDomain().CreateCategory(actor, input)
}

func (s *Service) UpdateShowcaseCategory(actor *model.User, id uint, input ShowcaseCategoryInput) (*ShowcaseCategory, error) {
	return s.showcaseDomain().UpdateCategory(actor, id, input)
}

func (s *Service) DeleteShowcaseCategory(actor *model.User, id uint) error {
	return s.showcaseDomain().DeleteCategory(actor, id)
}

// ---------- 用户侧 ----------

func (s *Service) SubmitShowcaseWork(actor *model.User, input ShowcaseWorkInput) (*ShowcaseWorkSummary, error) {
	return s.showcaseDomain().SubmitWork(actor, input)
}

func (s *Service) UpdateShowcaseWork(actor *model.User, id string, input ShowcaseWorkInput) (*ShowcaseWorkSummary, error) {
	return s.showcaseDomain().UpdateOwnWork(actor, id, input)
}

func (s *Service) WithdrawShowcaseWork(actor *model.User, id string) error {
	return s.showcaseDomain().WithdrawWork(actor, id)
}

func (s *Service) MyShowcaseWorks(actor *model.User) ([]ShowcaseWorkSummary, error) {
	return s.showcaseDomain().MyWorks(actor)
}

// ---------- 前台 ----------

func (s *Service) PublicShowcaseWorks(categoryID uint, page, pageSize int) (*ShowcasePublicPage, error) {
	return s.showcaseDomain().PublicWorks(categoryID, page, pageSize)
}

func (s *Service) ShowcaseWorkCanvas(id string, actor *model.User) (*ShowcaseSnapshot, error) {
	return s.showcaseDomain().WorkSnapshot(id, actor)
}

// ---------- 后台 ----------

func (s *Service) AdminShowcaseWorks(actor *model.User, status string, page, pageSize int) ([]ShowcaseWorkSummary, int64, error) {
	return s.showcaseDomain().AdminWorks(actor, status, page, pageSize)
}

func (s *Service) ReviewShowcaseWork(actor *model.User, id string, approve bool, note string) (*ShowcaseWorkSummary, error) {
	return s.showcaseDomain().ReviewWork(actor, id, approve, note)
}

func (s *Service) SetShowcaseWorkStatus(actor *model.User, id, status string) (*ShowcaseWorkSummary, error) {
	return s.showcaseDomain().SetWorkStatus(actor, id, status)
}
