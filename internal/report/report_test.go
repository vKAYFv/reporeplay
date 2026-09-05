package report

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/vKAYFv/reporeplay/internal/model"
)

func TestHTMLEmbedsEscapedJSON(t *testing.T) {
	data := model.Report{Repository: model.Repository{Name: "</script><script>alert(1)</script>"}}
	html, err := HTML(data)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(html, []byte("</script><script>alert(1)")) {
		t.Fatal("unsafe script boundary was embedded verbatim")
	}
	if !bytes.Contains(html, []byte(`\u003c/script\u003e`)) {
		t.Fatal("expected HTML-safe JSON escaping")
	}
}

func TestJSONIsValid(t *testing.T) {
	payload, err := JSON(model.Report{SchemaVersion: 1}, true)
	if err != nil {
		t.Fatal(err)
	}
	var decoded model.Report
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.SchemaVersion != 1 {
		t.Fatalf("schema version = %d", decoded.SchemaVersion)
	}
}
