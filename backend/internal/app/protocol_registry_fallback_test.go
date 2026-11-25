//go:build !windows

package app

import (
	"os"
	"path/filepath"
	"testing"
)

// 登记表属主/权限被改坏时，后端必须能隔离旧文件、用内置插件起来，
// 而不是让一个文件的权限位把整个服务打死（线上实际踩过）。
func TestPluginRuntimeRecoversFromUnreadableRegistry(t *testing.T) {
	if os.Geteuid() == 0 {
		t.Skip("root 不受文件权限位限制")
	}
	dataDir := t.TempDir()
	registry := filepath.Join(dataDir, "plugin_registry.json")
	if err := os.WriteFile(registry, []byte("[]"), 0o600); err != nil {
		t.Fatalf("写入登记表: %v", err)
	}
	if err := os.Chmod(registry, 0o000); err != nil {
		t.Fatalf("修改登记表权限: %v", err)
	}
	t.Cleanup(func() { _ = os.Chmod(registry, 0o600) })

	center, err := newPluginRuntime(dataDir)
	if err != nil {
		t.Fatalf("登记表不可读不应阻止启动: %v", err)
	}
	if len(center.plugins) == 0 {
		t.Fatal("内置插件应已重新自举")
	}

	quarantined, err := filepath.Glob(registry + ".unreadable-*")
	if err != nil {
		t.Fatalf("定位隔离文件: %v", err)
	}
	if len(quarantined) != 1 {
		t.Fatalf("应隔离出 1 个旧登记表，实际 %d 个", len(quarantined))
	}
	if _, err := os.Stat(registry); err != nil {
		t.Fatalf("应重建新的登记表: %v", err)
	}
}

// 非权限类错误（例如清单损坏）仍要按原样报错，不能被兜底逻辑吞掉。
func TestPluginRuntimeKeepsNonPermissionRegistryErrors(t *testing.T) {
	dataDir := t.TempDir()
	registry := filepath.Join(dataDir, "plugin_registry.json")
	if err := os.WriteFile(registry, []byte("{not json"), 0o600); err != nil {
		t.Fatalf("写入登记表: %v", err)
	}
	if _, err := newPluginRuntime(dataDir); err == nil {
		t.Fatal("登记表 JSON 损坏时应返回错误")
	}
	if _, err := os.Stat(registry); err != nil {
		t.Fatalf("损坏的登记表不应被隔离: %v", err)
	}
}
