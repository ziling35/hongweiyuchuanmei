package app

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 隔离动作本身必须跨平台可验证：把不可读写的登记表改名留档，而不是删掉。
func TestPluginRuntimeQuarantineRegistryRenamesFile(t *testing.T) {
	dataDir := t.TempDir()
	registry := filepath.Join(dataDir, "plugin_registry.json")
	if err := os.WriteFile(registry, []byte("[]"), 0o600); err != nil {
		t.Fatalf("写入登记表: %v", err)
	}
	center := &pluginRuntime{registryPath: registry, plugins: make(map[string]pluginRecord)}

	target, err := center.quarantineRegistry()
	if err != nil {
		t.Fatalf("quarantineRegistry() error = %v", err)
	}
	if !strings.Contains(target, "plugin_registry.json.unreadable-") {
		t.Fatalf("隔离文件名不符合预期：%s", target)
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("隔离文件不存在: %v", err)
	}
	if _, err := os.Stat(registry); !os.IsNotExist(err) {
		t.Fatalf("原登记表应已被移走，实际 err = %v", err)
	}
}

// 没有登记表时什么都不做，不能报错。
func TestPluginRuntimeQuarantineRegistryWithoutFile(t *testing.T) {
	dataDir := t.TempDir()
	center := &pluginRuntime{registryPath: filepath.Join(dataDir, "plugin_registry.json"), plugins: make(map[string]pluginRecord)}

	target, err := center.quarantineRegistry()
	if err != nil {
		t.Fatalf("quarantineRegistry() error = %v", err)
	}
	if target != "" {
		t.Fatalf("登记表不存在时不应产生隔离文件，实际 %s", target)
	}
}
