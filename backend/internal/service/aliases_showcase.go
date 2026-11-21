package service

import "yingce/backend/internal/app"

// 作品广场：类型与错误值全部来自 app 层，handler 只依赖本包。
type (
	ShowcaseCategory      = app.ShowcaseCategory
	ShowcaseCategoryInput = app.ShowcaseCategoryInput
	ShowcaseWorkInput     = app.ShowcaseWorkInput
	ShowcaseWorkSummary   = app.ShowcaseWorkSummary
	ShowcasePublicPage    = app.ShowcasePublicPage
	ShowcaseSnapshot      = app.ShowcaseSnapshot
)

var (
	ErrShowcaseInvalidInput  = app.ErrShowcaseInvalidInput
	ErrShowcaseNotFound      = app.ErrShowcaseNotFound
	ErrShowcaseForbidden     = app.ErrShowcaseForbidden
	ErrShowcaseDuplicate     = app.ErrShowcaseDuplicate
	ErrShowcaseCategoryInUse = app.ErrShowcaseCategoryInUse
)
