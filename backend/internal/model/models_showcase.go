package model

import "time"

// ShowcaseCategory 作品广场分类。
// 由管理员在后台维护（名称、排序、是否启用），用户发布作品时从中选一个。
type ShowcaseCategory struct {
	ID        uint      `json:"id" gorm:"primaryKey;autoIncrement"`
	Slug      string    `json:"slug" gorm:"size:64;uniqueIndex"`
	Name      string    `json:"name" gorm:"size:64"`
	SortOrder int       `json:"sortOrder" gorm:"index"`
	Enabled   bool      `json:"enabled" gorm:"index"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (ShowcaseCategory) TableName() string { return "showcase_categories" }

// 作品状态：pending 待审核、published 已上架、rejected 未通过、hidden 已下架。
const (
	ShowcaseStatusPending   = "pending"
	ShowcaseStatusPublished = "published"
	ShowcaseStatusRejected  = "rejected"
	ShowcaseStatusHidden    = "hidden"
)

// 作品媒体形态：image 图片作品、video 视频作品。
const (
	ShowcaseMediaImage = "image"
	ShowcaseMediaVideo = "video"
)

// ShowcaseWork 用户公开到作品广场的作品。
//
// 内容在提交那一刻快照进 Snapshot，之后作者改动画布、甚至删除画布，都不影响已上架的作品；
// 「查看制作过程」与「复制项目」都读这份快照，不依赖原画布仍然存在。
type ShowcaseWork struct {
	ID          string     `json:"id" gorm:"primaryKey;size:36"`
	OwnerID     string     `json:"ownerId" gorm:"index;size:36"`
	ProjectID   string     `json:"projectId" gorm:"index;size:80"`
	CategoryID  uint       `json:"categoryId" gorm:"index"`
	Title       string     `json:"title" gorm:"size:200"`
	Description string     `json:"description" gorm:"type:text"`
	MediaKind   string     `json:"mediaKind" gorm:"size:16;index"`
	CoverKey    string     `json:"coverKey" gorm:"size:255"`
	VideoKey    string     `json:"videoKey" gorm:"size:255"`
	Snapshot    string     `json:"-" gorm:"type:text"`
	Status      string     `json:"status" gorm:"size:16;index"`
	ReviewNote  string     `json:"reviewNote" gorm:"size:500"`
	SortOrder   int        `json:"sortOrder" gorm:"index"`
	PublishedAt *time.Time `json:"publishedAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

func (ShowcaseWork) TableName() string { return "showcase_works" }
