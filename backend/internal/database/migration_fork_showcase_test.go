package database

import (
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

func forkShowcaseLedgerDatabase(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := Open(Config{Driver: "sqlite", DSN: "file:" + t.Name() + "?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	// 回到 fork 合并上游之前的状态：110 是 showcase_works，账本里没有任何更晚的记录。
	// 不能只删 111——新增迁移（如 112 banner_background_style）后，残留的更晚记录会被
	// normalizeForkShowcaseMigration 判成「已存在后续迁移」，与真实的历史现场不符。
	if err := db.Exec("DELETE FROM schema_migrations WHERE version > ?", legacyShowcaseWorksMigrationVersion).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&schemaMigration{}).
		Where("version = ?", legacyShowcaseWorksMigrationVersion).
		Updates(map[string]any{
			"name":     showcaseWorksMigrationName,
			"checksum": legacyShowcaseWorksMigrationChecksum,
		}).Error; err != nil {
		t.Fatal(err)
	}
	return db
}

func TestMigrateSchemaRealignsForkShowcaseLedger(t *testing.T) {
	db := forkShowcaseLedgerDatabase(t)
	if err := MigrateSchema(db); err != nil {
		t.Fatalf("MigrateSchema() error = %v", err)
	}
	if err := RequireSchemaVersion(db); err != nil {
		t.Fatalf("RequireSchemaVersion() error = %v", err)
	}

	var upstream schemaMigration
	if err := db.First(&upstream, "version = ?", 110).Error; err != nil {
		t.Fatal(err)
	}
	if upstream.Name != "cloud_agent_history_archives" || upstream.Checksum != "sha256:cloud-agent-history-archives-v110-20261123" {
		t.Fatalf("version 110 = %+v, want upstream cloud_agent_history_archives", upstream)
	}

	var showcase schemaMigration
	if err := db.First(&showcase, "version = ?", showcaseWorksMigrationVersion).Error; err != nil {
		t.Fatal(err)
	}
	if showcase.Name != showcaseWorksMigrationName || showcase.Checksum != showcaseWorksMigrationChecksum {
		t.Fatalf("version %d = %+v, want fork showcase_works", showcaseWorksMigrationVersion, showcase)
	}
	if !db.Migrator().HasTable(&model.ShowcaseWork{}) || !db.Migrator().HasTable(&model.ShowcaseCategory{}) {
		t.Fatal("showcase tables are missing after realigning the fork ledger")
	}
	if !db.Migrator().HasTable(&model.CloudAgentHistoryArchive{}) {
		t.Fatal("upstream history archive table is missing after realigning the fork ledger")
	}
}

func TestMigrateSchemaRejectsShowcaseLedgerWithLaterRecords(t *testing.T) {
	db := forkShowcaseLedgerDatabase(t)
	// 111 已被占用时不能改写 110，否则会覆盖别的迁移身份。
	if err := db.Create(&schemaMigration{
		Version:   showcaseWorksMigrationVersion,
		Name:      "other_migration",
		Checksum:  "sha256:other-migration",
		AppliedAt: time.Now().UTC(),
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err == nil || !strings.Contains(err.Error(), "拒绝自动改写迁移账本") {
		t.Fatalf("expected lineage guard, got %v", err)
	}
}
