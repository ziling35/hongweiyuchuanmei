package app

import (
	"os"
	"path/filepath"
	"testing"
)

// 官方目录里撤下的内置插件会被 bootstrap 标记 withdrawn：既不加载，也不再由仓库管理。
// 这个 ID 不能因此被永久占住——管理员应当可以用自己的自定义包接管它。
func TestPluginRuntimeAllowsUploadToTakeOverWithdrawnOfficialPlugin(t *testing.T) {
	const id = "retired-official-video"
	officialDir := t.TempDir()
	t.Setenv("CANVAS_OFFICIAL_PLUGIN_DIR", officialDir)
	packagePath := filepath.Join(officialDir, id+".yingce-plugin")
	if err := os.WriteFile(packagePath, testPluginPackage(t, takeoverTestManifest(id, "1.0.0", "Retired Official Video")), 0o600); err != nil {
		t.Fatal(err)
	}

	dataDir := t.TempDir()
	installed, err := newPluginRuntime(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if record, ok := installed.plugins[id]; !ok || record.Source != PluginOriginOfficial {
		t.Fatalf("official plugin was not installed: %#v", record)
	}
	if err := os.Remove(packagePath); err != nil {
		t.Fatal(err)
	}

	withdrawn, err := newPluginRuntime(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if _, loaded := withdrawn.plugins[id]; loaded {
		t.Fatal("removed official plugin is still loaded")
	}

	view, err := withdrawn.install(testPluginPackage(t, takeoverTestManifest(id, "1.0.1", "My Own Video")), id+".yingce-plugin")
	if err != nil {
		t.Fatalf("upload after official removal: %v", err)
	}
	record, loaded := withdrawn.plugins[id]
	if !loaded || record.Source != PluginOriginUploaded || view.Manifest.Version != "1.0.1" {
		t.Fatalf("takeover record = %#v, view version = %q", record, view.Manifest.Version)
	}
}

// 仍在发行的内置插件依旧不能被上传覆盖。
func TestPluginRuntimeStillRejectsUploadOverPublishedOfficialPlugin(t *testing.T) {
	const id = "published-official-video"
	officialDir := t.TempDir()
	t.Setenv("CANVAS_OFFICIAL_PLUGIN_DIR", officialDir)
	if err := os.WriteFile(filepath.Join(officialDir, id+".yingce-plugin"), testPluginPackage(t, takeoverTestManifest(id, "1.0.0", "Published Official Video")), 0o600); err != nil {
		t.Fatal(err)
	}

	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := center.install(testPluginPackage(t, takeoverTestManifest(id, "1.0.1", "Hijacked")), id+".yingce-plugin"); err == nil {
		t.Fatal("upload replaced a published official plugin")
	}
	if record := center.plugins[id]; record.Source != PluginOriginOfficial || record.Metadata.Version != "1.0.0" {
		t.Fatalf("published official plugin was disturbed: %#v", record)
	}
}

func takeoverTestManifest(id, version, name string) []byte {
	return []byte(`{"apiVersion":"yingce.plugin/v2","id":"` + id + `","version":"` + version + `","name":"` + name +
		`","author":"Test","documentation":"# ` + name + `\n\n## 影策运行时合同","contributes":{"providers":[{"id":"` + id +
		`","label":"` + name + `","capabilities":["video"],"scopes":["canvas"],"create":{"method":"POST","path":"/tasks","body":{"prompt":{"$ref":"request.prompt"}}},"response":{"status":"pending"}}]}}`)
}
