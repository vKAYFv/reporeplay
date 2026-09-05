package report

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/vKAYFv/reporeplay/internal/model"
)

//go:embed template.html
var template []byte

var marker = []byte("__REPOREPLAY_DATA__")

func HTML(data model.Report) ([]byte, error) {
	payload, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("encode report data: %w", err)
	}
	if !bytes.Contains(template, marker) {
		return nil, fmt.Errorf("report template is missing data marker")
	}
	return bytes.Replace(template, marker, payload, 1), nil
}

func JSON(data model.Report, pretty bool) ([]byte, error) {
	if pretty {
		return json.MarshalIndent(data, "", "  ")
	}
	return json.Marshal(data)
}
