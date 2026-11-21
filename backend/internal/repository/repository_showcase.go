package repository

import (
	"errors"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// ErrShowcaseNotFound 作品或分类不存在（或不属于该用户）。
var ErrShowcaseNotFound = errors.New("showcase not found")

// ---------- 分类 ----------

// ShowcaseCategories 按后台排序列出分类；includeDisabled 为 false 时只返回启用中的。
func (r *Repository) ShowcaseCategories(includeDisabled bool) ([]model.ShowcaseCategory, error) {
	query := r.db.Order("sort_order asc, id asc")
	if !includeDisabled {
		query = query.Where("enabled = ?", true)
	}
	var items []model.ShowcaseCategory
	err := query.Find(&items).Error
	return items, err
}

func (r *Repository) ShowcaseCategory(id uint) (*model.ShowcaseCategory, error) {
	var item model.ShowcaseCategory
	if err := r.db.First(&item, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrShowcaseNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (r *Repository) CreateShowcaseCategory(item *model.ShowcaseCategory) error {
	return r.db.Create(item).Error
}

func (r *Repository) SaveShowcaseCategory(item *model.ShowcaseCategory) error {
	return r.db.Save(item).Error
}

// DeleteShowcaseCategory 分类下有作品时拒绝删除，避免作品变成孤儿。
func (r *Repository) DeleteShowcaseCategory(id uint) error {
	var count int64
	if err := r.db.Model(&model.ShowcaseWork{}).Where("category_id = ?", id).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return ErrShowcaseCategoryInUse
	}
	return r.db.Delete(&model.ShowcaseCategory{}, id).Error
}

// ErrShowcaseCategoryInUse 分类下仍有作品。
var ErrShowcaseCategoryInUse = errors.New("showcase category in use")

// ---------- 作品 ----------

func (r *Repository) CreateShowcaseWork(item *model.ShowcaseWork) error {
	return r.db.Create(item).Error
}

func (r *Repository) SaveShowcaseWork(item *model.ShowcaseWork) error {
	return r.db.Save(item).Error
}

func (r *Repository) ShowcaseWork(id string) (*model.ShowcaseWork, error) {
	var item model.ShowcaseWork
	if err := r.db.Where("id = ?", id).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrShowcaseNotFound
		}
		return nil, err
	}
	return &item, nil
}

// ShowcaseWorkForOwner 按 id + 作者取作品，用于"只能改自己的"。
func (r *Repository) ShowcaseWorkForOwner(id, ownerID string) (*model.ShowcaseWork, error) {
	var item model.ShowcaseWork
	if err := r.db.Where("id = ? AND owner_id = ?", id, ownerID).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrShowcaseNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (r *Repository) ShowcaseWorksByOwner(ownerID string) ([]model.ShowcaseWork, error) {
	var items []model.ShowcaseWork
	err := r.db.Where("owner_id = ?", ownerID).Order("created_at desc").Find(&items).Error
	return items, err
}

// ShowcaseWorkExists 发布前判重：同一画布只允许一个待审核/已上架的作品。
func (r *Repository) ShowcaseWorkExists(ownerID, projectID string) (bool, error) {
	var count int64
	err := r.db.Model(&model.ShowcaseWork{}).
		Where("owner_id = ? AND project_id = ? AND status IN ?", ownerID, projectID, []string{model.ShowcaseStatusPending, model.ShowcaseStatusPublished}).
		Count(&count).Error
	return count > 0, err
}

// PublishedShowcaseWorks 作品广场列表：只取已上架，按发布时间倒序，可按分类过滤。
func (r *Repository) PublishedShowcaseWorks(categoryID uint, limit, offset int) ([]model.ShowcaseWork, int64, error) {
	query := r.db.Model(&model.ShowcaseWork{}).Where("status = ?", model.ShowcaseStatusPublished)
	if categoryID > 0 {
		query = query.Where("category_id = ?", categoryID)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.ShowcaseWork
	err := query.Order("published_at desc, created_at desc").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

// AdminShowcaseWorks 后台列表：可按状态过滤。
func (r *Repository) AdminShowcaseWorks(status string, limit, offset int) ([]model.ShowcaseWork, int64, error) {
	query := r.db.Model(&model.ShowcaseWork{})
	if status != "" && status != "all" {
		query = query.Where("status = ?", status)
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var items []model.ShowcaseWork
	err := query.Order("created_at desc").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

func (r *Repository) DeleteShowcaseWork(id string) error {
	return r.db.Where("id = ?", id).Delete(&model.ShowcaseWork{}).Error
}

// ShowcaseCategoryCounts 每个分类下已上架作品数，给前台分类胶囊显示条数。
func (r *Repository) ShowcaseCategoryCounts() (map[uint]int64, error) {
	type row struct {
		CategoryID uint
		Total      int64
	}
	var rows []row
	err := r.db.Model(&model.ShowcaseWork{}).
		Select("category_id, count(*) as total").
		Where("status = ?", model.ShowcaseStatusPublished).
		Group("category_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[uint]int64, len(rows))
	for _, item := range rows {
		out[item.CategoryID] = item.Total
	}
	return out, nil
}
