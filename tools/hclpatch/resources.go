package main

import (
	"regexp"
	"strings"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclsyntax"
)

// ResourceBlock is a parsed Terraform resource block.
type ResourceBlock struct {
	Type      string `json:"resource_type"`
	Name      string `json:"resource_name"`
	FilePath  string `json:"file_path"`
	Body      string `json:"body,omitempty"`
	LineStart int    `json:"line_start"`
	LineEnd   int    `json:"line_end,omitempty"`
	File      string `json:"-"`
	StartByte int    `json:"-"`
	EndByte   int    `json:"-"`
}

type ResourceMatch struct {
	ResourceBlock
	MatchReason string `json:"match_reason"`
}

var attrStringRe = regexp.MustCompile(`(?m)^\s*([a-zA-Z0-9_.]+)\s*=\s*"([^"]*)"`)

func parseAllResources(files []TfFile) []ResourceBlock {
	var out []ResourceBlock
	for _, f := range files {
		file, diags := hclsyntax.ParseConfig([]byte(f.Content), f.Path, hcl.Pos{Line: 1, Column: 1})
		if diags.HasErrors() || file == nil {
			out = append(out, parseResourcesRegex(f)...)
			continue
		}
		body, ok := file.Body.(*hclsyntax.Body) //nolint - hcl.File body is *hclsyntax.Body
		if !ok {
			continue
		}
		for _, blk := range body.Blocks {
			if blk.Type != "resource" || len(blk.Labels) < 2 {
				continue
			}
			rng := blk.Range()
			start, end := rng.Start.Byte, rng.End.Byte
			slice := []byte(f.Content)
			if end > len(slice) {
				end = len(slice)
			}
			if start > end {
				start = 0
			}
			out = append(out, ResourceBlock{
				Type:      blk.Labels[0],
				Name:      blk.Labels[1],
				FilePath:  f.Path,
				Body:      string(slice[start:end]),
				File:      f.Content,
				StartByte: start,
				EndByte:   end,
				LineStart: rng.Start.Line,
				LineEnd:   rng.End.Line,
			})
		}
	}
	return out
}

func parseResourcesRegex(f TfFile) []ResourceBlock {
	var out []ResourceBlock
	for _, m := range resourceHead.FindAllStringSubmatchIndex(f.Content, -1) {
		rtype := f.Content[m[2]:m[3]]
		rname := f.Content[m[4]:m[5]]
		start := m[0]
		body := extractBraceBlock(f.Content, m[1]-1)
		end := start + len(body) + (m[1] - start)
		if end > len(f.Content) {
			end = len(f.Content)
		}
		out = append(out, ResourceBlock{
			Type: rtype, Name: rname, FilePath: f.Path, Body: body, File: f.Content,
			StartByte: start, EndByte: end,
			LineStart: lineNumber(f.Content, start),
			LineEnd:   lineNumber(f.Content, end),
		})
	}
	return out
}

func attrsFromBody(body string) map[string]string {
	m := map[string]string{}
	for _, match := range attrStringRe.FindAllStringSubmatch(body, -1) {
		if len(match) >= 3 {
			m[match[1]] = match[2]
		}
	}
	return m
}

func lineNumber(content string, byteIdx int) int {
	if byteIdx < 0 || byteIdx > len(content) {
		return 1
	}
	return 1 + strings.Count(content[:byteIdx], "\n")
}

func replaceResourceBlock(fileContent string, r ResourceBlock, replacement string) string {
	if r.EndByte > r.StartByte && r.EndByte <= len(fileContent) {
		return fileContent[:r.StartByte] + replacement + fileContent[r.EndByte:]
	}
	return strings.Replace(fileContent, r.Body, replacement, 1)
}
