// Package showcase 实现「作品广场」：用户把画布公开成作品，管理员配分类、审核上架，
// 访客可以查看制作过程并把作品复制成自己的画布。
//
// 作品内容在提交时快照（JSON 字符串），之后与原画布解耦：作者改画布、删画布都不影响已上架作品，
// 「查看制作过程」和「复制项目」都只读快照。
package showcase

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// AdminGate 由 app 层实现，只暴露「是不是管理员」这一件事。
type AdminGate interface {
	RequireAdmin(user *model.User) error
}

var (
	ErrInvalidInput   = errors.New("参数不合法")
	ErrNotFound       = errors.New("作品不存在")
	ErrForbidden      = errors.New("无权操作该作品")
	ErrDuplicate      = errors.New("这个画布已经公开过")
	ErrCategoryUnused = errors.New("分类下还有作品，不能删除")
)

// Category 对外分类视图。
type Category struct {
	ID        uint   `json:"id"`
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
	Enabled   bool   `json:"enabled"`
	WorkCount int64  `json:"workCount"`
}

// CategoryInput 后台新建/编辑分类的入参。
type CategoryInput struct {
	Slug      string `json:"slug"`
	Name      string `json:"name"`
	SortOrder int    `json:"sortOrder"`
	Enabled   *bool  `json:"enabled"`
}

// WorkInput 用户提交作品的入参；Snapshot 是画布快照 JSON（不含二进制）。
type WorkInput struct {
	ProjectID   string `json:"projectId"`
	CategoryID  uint   `json:"categoryId"`
	Title       string `json:"title"`
	Description string `json:"description"`
	MediaKind   string `json:"mediaKind"`
	CoverKey    string `json:"coverKey"`
	VideoKey    string `json:"videoKey"`
	Snapshot    string `json:"snapshot"`
}

// WorkSummary 列表项：不含快照，列表页不需要把整份画布带下来。
type WorkSummary struct {
	ID          string     `json:"id"`
	OwnerID     string     `json:"ownerId"`
	ProjectID   string     `json:"projectId"`
	CategoryID  uint       `json:"categoryId"`
	Category    string     `json:"categoryName"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	MediaKind   string     `json:"mediaKind"`
	CoverKey    string     `json:"coverKey"`
	VideoKey    string     `json:"videoKey"`
	Status      string     `json:"status"`
	ReviewNote  string     `json:"reviewNote"`
	PublishedAt *time.Time `json:"publishedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// PublicPage 作品广场列表响应。
type PublicPage struct {
	Items      []WorkSummary `json:"items"`
	Total      int64         `json:"total"`
	Page       int           `json:"page"`
	PageSize   int           `json:"pageSize"`
	Categories []Category    `json:"categories"`
}

// SnapshotPayload 「查看制作过程」/「复制项目」返回的画布快照。
type SnapshotPayload struct {
	Work   WorkSummary     `json:"work"`
	Canvas json.RawMessage `json:"canvas"`
}

// Service 作品广场域服务。
type Service struct {
	repo  *repository.Repository
	admin AdminGate
}

func New(repo *repository.Repository, admin AdminGate) *Service {
	return &Service{repo: repo, admin: admin}
}

func newID() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(buf)
}

func toSummary(item *model.ShowcaseWork, categoryName string) WorkSummary {
	return WorkSummary{
		ID:          item.ID,
		OwnerID:     item.OwnerID,
		ProjectID:   item.ProjectID,
		CategoryID:  item.CategoryID,
		Category:    categoryName,
		Title:       item.Title,
		Description: item.Description,
		MediaKind:   item.MediaKind,
		CoverKey:    item.CoverKey,
		VideoKey:    item.VideoKey,
		Status:      item.Status,
		ReviewNote:  item.ReviewNote,
		PublishedAt: item.PublishedAt,
		CreatedAt:   item.CreatedAt,
	}
}

// ---------- 分类 ----------

// ListCategories 前台/发布弹窗用：只返回启用中的分类，并带上各分类已上架作品数。
func (s *Service) ListCategories(includeDisabled bool) ([]Category, error) {
	items, err := s.repo.ShowcaseCategories(includeDisabled)
	if err != nil {
		return nil, err
	}
	counts, err := s.repo.ShowcaseCategoryCounts()
	if err != nil {
		return nil, err
	}
	out := make([]Category, 0, len(items))
	for _, item := range items {
		out = append(out, Category{
			ID:        item.ID,
			Slug:      item.Slug,
			Name:      item.Name,
			SortOrder: item.SortOrder,
			Enabled:   item.Enabled,
			WorkCount: counts[item.ID],
		})
	}
	return out, nil
}

// CreateCategory 仅管理员。
func (s *Service) CreateCategory(actor *model.User, input CategoryInput) (*Category, error) {
	if err := s.admin.RequireAdmin(actor); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(input.Name)
	slug := strings.TrimSpace(input.Slug)
	if name == "" || slug == "" {
		return nil, ErrInvalidInput
	}
	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}
	item := &model.ShowcaseCategory{Slug: slug, Name: name, SortOrder: input.SortOrder, Enabled: enabled}
	if err := s.repo.CreateShowcaseCategory(item); err != nil {
		return nil, err
	}
	return &Category{ID: item.ID, Slug: item.Slug, Name: item.Name, SortOrder: item.SortOrder, Enabled: item.Enabled}, nil
}

// UpdateCategory 仅管理员。
func (s *Service) UpdateCategory(actor *model.User, id uint, input CategoryInput) (*Category, error) {
	if err := s.admin.RequireAdmin(actor); err != nil {
		return nil, err
	}
	item, err := s.repo.ShowcaseCategory(id)
	if err != nil {
		return nil, ErrNotFound
	}
	if name := strings.TrimSpace(input.Name); name != "" {
		item.Name = name
	}
	if slug := strings.TrimSpace(input.Slug); slug != "" {
		item.Slug = slug
	}
	item.SortOrder = input.SortOrder
	if input.Enabled != nil {
		item.Enabled = *input.Enabled
	}
	if err := s.repo.SaveShowcaseCategory(item); err != nil {
		return nil, err
	}
	return &Category{ID: item.ID, Slug: item.Slug, Name: item.Name, SortOrder: item.SortOrder, Enabled: item.Enabled}, nil
}

// DeleteCategory 仅管理员；分类下还有作品时拒绝。
func (s *Service) DeleteCategory(actor *model.User, id uint) error {
	if err := s.admin.RequireAdmin(actor); err != nil {
		return err
	}
	if err := s.repo.DeleteShowcaseCategory(id); err != nil {
		if errors.Is(err, repository.ErrShowcaseCategoryInUse) {
			return ErrCategoryUnused
		}
		return err
	}
	return nil
}

func (s *Service) categoryName(id uint) string {
	if id == 0 {
		return ""
	}
	item, err := s.repo.ShowcaseCategory(id)
	if err != nil {
		return ""
	}
	return item.Name
}

// ---------- 用户侧 ----------

func (s *Service) validateWorkInput(input WorkInput) error {
	if strings.TrimSpace(input.Title) == "" || len([]rune(input.Title)) > 200 {
		return ErrInvalidInput
	}
	if input.CategoryID == 0 || input.CoverKey == "" {
		return ErrInvalidInput
	}
	if input.MediaKind != model.ShowcaseMediaImage && input.MediaKind != model.ShowcaseMediaVideo {
		return ErrInvalidInput
	}
	// 视频作品没有视频文件就没法悬停预览，直接拒绝。
	if input.MediaKind == model.ShowcaseMediaVideo && input.VideoKey == "" {
		return ErrInvalidInput
	}
	if !json.Valid([]byte(input.Snapshot)) {
		return ErrInvalidInput
	}
	return nil
}

// SubmitWork 用户提交作品：落库为待审核，同一画布不能重复提交。
func (s *Service) SubmitWork(actor *model.User, input WorkInput) (*WorkSummary, error) {
	if actor == nil {
		return nil, ErrForbidden
	}
	if err := s.validateWorkInput(input); err != nil {
		return nil, err
	}
	category, err := s.repo.ShowcaseCategory(input.CategoryID)
	if err != nil {
		return nil, ErrInvalidInput
	}
	if !category.Enabled {
		return nil, ErrInvalidInput
	}
	exists, err := s.repo.ShowcaseWorkExists(actor.ID, input.ProjectID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrDuplicate
	}
	item := &model.ShowcaseWork{
		ID:          newID(),
		OwnerID:     actor.ID,
		ProjectID:   input.ProjectID,
		CategoryID:  input.CategoryID,
		Title:       strings.TrimSpace(input.Title),
		Description: strings.TrimSpace(input.Description),
		MediaKind:   input.MediaKind,
		CoverKey:    input.CoverKey,
		VideoKey:    input.VideoKey,
		Snapshot:    input.Snapshot,
		Status:      model.ShowcaseStatusPending,
	}
	if err := s.repo.CreateShowcaseWork(item); err != nil {
		return nil, err
	}
	summary := toSummary(item, category.Name)
	return &summary, nil
}

// UpdateOwnWork 作者改自己的作品；已上架的作品改动后回到待审核。
func (s *Service) UpdateOwnWork(actor *model.User, id string, input WorkInput) (*WorkSummary, error) {
	if actor == nil {
		return nil, ErrForbidden
	}
	item, err := s.repo.ShowcaseWorkForOwner(id, actor.ID)
	if err != nil {
		return nil, ErrNotFound
	}
	if err := s.validateWorkInput(input); err != nil {
		return nil, err
	}
	item.CategoryID = input.CategoryID
	item.Title = strings.TrimSpace(input.Title)
	item.Description = strings.TrimSpace(input.Description)
	item.MediaKind = input.MediaKind
	item.CoverKey = input.CoverKey
	item.VideoKey = input.VideoKey
	item.Snapshot = input.Snapshot
	item.Status = model.ShowcaseStatusPending
	item.ReviewNote = ""
	item.PublishedAt = nil
	if err := s.repo.SaveShowcaseWork(item); err != nil {
		return nil, err
	}
	summary := toSummary(item, s.categoryName(item.CategoryID))
	return &summary, nil
}

// WithdrawWork 作者撤下自己的作品（直接删除记录，快照随之丢弃）。
func (s *Service) WithdrawWork(actor *model.User, id string) error {
	if actor == nil {
		return ErrForbidden
	}
	if _, err := s.repo.ShowcaseWorkForOwner(id, actor.ID); err != nil {
		return ErrNotFound
	}
	return s.repo.DeleteShowcaseWork(id)
}

// MyWorks 作者自己的作品列表（含待审核与被驳回的，带驳回原因）。
func (s *Service) MyWorks(actor *model.User) ([]WorkSummary, error) {
	if actor == nil {
		return nil, ErrForbidden
	}
	items, err := s.repo.ShowcaseWorksByOwner(actor.ID)
	if err != nil {
		return nil, err
	}
	names := map[uint]string{}
	out := make([]WorkSummary, 0, len(items))
	for i := range items {
		id := items[i].CategoryID
		if _, ok := names[id]; !ok {
			names[id] = s.categoryName(id)
		}
		out = append(out, toSummary(&items[i], names[id]))
	}
	return out, nil
}

// ---------- 前台 ----------

// PublicWorks 作品广场列表：只返回已上架作品，可按分类过滤。
func (s *Service) PublicWorks(categoryID uint, page, pageSize int) (*PublicPage, error) {
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 60 {
		pageSize = 24
	}
	items, total, err := s.repo.PublishedShowcaseWorks(categoryID, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, err
	}
	categories, err := s.ListCategories(false)
	if err != nil {
		return nil, err
	}
	names := map[uint]string{}
	for _, c := range categories {
		names[c.ID] = c.Name
	}
	out := make([]WorkSummary, 0, len(items))
	for i := range items {
		out = append(out, toSummary(&items[i], names[items[i].CategoryID]))
	}
	return &PublicPage{Items: out, Total: total, Page: page, PageSize: pageSize, Categories: categories}, nil
}

// WorkSnapshot 「查看制作过程」和「复制项目」共用：已上架的作品谁都能读，
// 未上架的只有作者本人能读。
func (s *Service) WorkSnapshot(id string, actor *model.User) (*SnapshotPayload, error) {
	item, err := s.repo.ShowcaseWork(id)
	if err != nil {
		return nil, ErrNotFound
	}
	if item.Status != model.ShowcaseStatusPublished {
		if actor == nil || actor.ID != item.OwnerID {
			return nil, ErrNotFound
		}
	}
	// 快照在提交时已校验过是合法 JSON，这里再兜一层，避免脏数据把前台打挂。
	if !json.Valid([]byte(item.Snapshot)) {
		return nil, ErrNotFound
	}
	return &SnapshotPayload{
		Work:   toSummary(item, s.categoryName(item.CategoryID)),
		Canvas: json.RawMessage(item.Snapshot),
	}, nil
}

// ---------- 后台 ----------

// AdminWorks 后台作品列表，可按状态过滤。
func (s *Service) AdminWorks(actor *model.User, status string, page, pageSize int) ([]WorkSummary, int64, error) {
	if err := s.admin.RequireAdmin(actor); err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	items, total, err := s.repo.AdminShowcaseWorks(status, pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	out := make([]WorkSummary, 0, len(items))
	for i := range items {
		out = append(out, toSummary(&items[i], s.categoryName(items[i].CategoryID)))
	}
	return out, total, nil
}

// ReviewWork 管理员审核：通过则上架并记录发布时间，驳回则带上原因退回作者。
func (s *Service) ReviewWork(actor *model.User, id string, approve bool, note string) (*WorkSummary, error) {
	if err := s.admin.RequireAdmin(actor); err != nil {
		return nil, err
	}
	item, err := s.repo.ShowcaseWork(id)
	if err != nil {
		return nil, ErrNotFound
	}
	now := time.Now()
	if approve {
		item.Status = model.ShowcaseStatusPublished
		item.PublishedAt = &now
		item.ReviewNote = strings.TrimSpace(note)
	} else {
		item.Status = model.ShowcaseStatusRejected
		item.PublishedAt = nil
		item.ReviewNote = strings.TrimSpace(note)
	}
	if err := s.repo.SaveShowcaseWork(item); err != nil {
		return nil, err
	}
	summary := toSummary(item, s.categoryName(item.CategoryID))
	return &summary, nil
}

// SetWorkStatus 管理员上下架。
func (s *Service) SetWorkStatus(actor *model.User, id, status string) (*WorkSummary, error) {
	if err := s.admin.RequireAdmin(actor); err != nil {
		return nil, err
	}
	switch status {
	case model.ShowcaseStatusPublished, model.ShowcaseStatusHidden:
	default:
		return nil, ErrInvalidInput
	}
	item, err := s.repo.ShowcaseWork(id)
	if err != nil {
		return nil, ErrNotFound
	}
	item.Status = status
	if status == model.ShowcaseStatusPublished && item.PublishedAt == nil {
		now := time.Now()
		item.PublishedAt = &now
	}
	if err := s.repo.SaveShowcaseWork(item); err != nil {
		return nil, err
	}
	summary := toSummary(item, s.categoryName(item.CategoryID))
	return &summary, nil
}
