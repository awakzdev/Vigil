package main

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/hashicorp/hcl/v2"
	"github.com/hashicorp/hcl/v2/hclsyntax"
)

func parseConfig(f TfFile) (*hcl.File, hcl.Diagnostics) {
	return hclsyntax.ParseConfig([]byte(f.Content), f.Path, hcl.Pos{Line: 1, Column: 1})
}

type PatchRequest struct {
	CheckID    string   `json:"check_id"`
	BucketName string   `json:"bucket_name,omitempty"`
	KeyID      string   `json:"key_id,omitempty"`
	GroupID    string   `json:"group_id,omitempty"`
	GroupName  string   `json:"group_name,omitempty"`
	Files      []TfFile `json:"files"`
}

type PatchResponse struct {
	Status         string          `json:"status"`
	Message        string          `json:"message,omitempty"`
	CheckID        string          `json:"check_id,omitempty"`
	FilePath       string          `json:"file_path,omitempty"`
	Action         string          `json:"action,omitempty"`
	SuggestedHCL   string          `json:"suggested_hcl,omitempty"`
	PatchedContent string          `json:"patched_content,omitempty"`
	Matches        []ResourceMatch `json:"matches,omitempty"`
}

var (
	resourceHead = regexp.MustCompile(`resource\s+"([^"]+)"\s+"([^"]+)"\s*\{`)
	bucketAttr   = regexp.MustCompile(`(?m)^\s*bucket\s*=\s*"([^"]+)"`)
)

func patchRequest(req PatchRequest) PatchResponse {
	scan := scanRequest(ScanRequest{
		CheckID: req.CheckID, BucketName: req.BucketName, KeyID: req.KeyID,
		GroupID: req.GroupID, GroupName: req.GroupName, Files: req.Files,
	})
	if scan.Status == "not_found" {
		return PatchResponse{Status: "not_found", Message: scan.Message, CheckID: req.CheckID}
	}
	if scan.Status == "unsupported" || scan.Status == "error" {
		return PatchResponse{Status: scan.Status, Message: scan.Message, CheckID: req.CheckID}
	}

	switch req.CheckID {
	case "s3.bucket.public_access_not_blocked":
		return patchS3PublicAccess(req, scan.Matches)
	case "kms.key.no_rotation":
		return patchKmsRotation(req, scan.Matches)
	case "ec2.security_group.unrestricted_ssh", "ec2.security_group.unrestricted_rdp":
		return PatchResponse{
			Status:  "repo_context_required",
			CheckID: req.CheckID,
			Message: "Security group ingress is imperative — use EventBridge or CLI. Terraform match(es) listed for manual review.",
			Matches: scan.Matches,
		}
	default:
		return PatchResponse{Status: "unsupported", CheckID: req.CheckID, Message: "HCL patch not implemented for this check"}
	}
}

func patchS3PublicAccess(req PatchRequest, matches []ResourceMatch) PatchResponse {
	if req.BucketName == "" && len(matches) == 0 {
		return PatchResponse{Status: "error", Message: "bucket_name required"}
	}
	bucketRes := matches[0].ResourceBlock
	bucketName := bucketRes.Name

	snippet := fmt.Sprintf(`resource "aws_s3_bucket_public_access_block" "%s" {
  bucket = aws_s3_bucket.%s.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
`, bucketName, bucketName)

	resources := parseAllResources(req.Files)
	for _, f := range req.Files {
		for _, r := range resources {
			if r.Type != "aws_s3_bucket_public_access_block" || r.FilePath != f.Path {
				continue
			}
			if strings.Contains(r.Body, bucketName) {
				replacement := strings.TrimSuffix(snippet, "\n")
				patched := replaceResourceBlock(f.Content, r, replacement)
				return PatchResponse{
					Status: "modify_existing", FilePath: f.Path,
					Action: "Update aws_s3_bucket_public_access_block", SuggestedHCL: snippet,
					PatchedContent: patched, Matches: matches,
				}
			}
		}
	}

	return PatchResponse{
		Status: "create_new", FilePath: bucketRes.FilePath,
		Action: "Append aws_s3_bucket_public_access_block", SuggestedHCL: snippet,
		PatchedContent: strings.TrimSpace(bucketRes.File) + "\n\n" + snippet, Matches: matches,
	}
}

func patchKmsRotation(req PatchRequest, matches []ResourceMatch) PatchResponse {
	if len(matches) == 0 {
		return PatchResponse{Status: "not_found", Message: "no aws_kms_key match"}
	}
	r := matches[0].ResourceBlock
	if strings.Contains(r.Body, "enable_key_rotation") {
		re := regexp.MustCompile(`enable_key_rotation\s*=\s*false`)
		newBody := re.ReplaceAllString(r.Body, "enable_key_rotation = true")
		if newBody != r.Body {
			return PatchResponse{
				Status: "modify_existing", FilePath: r.FilePath,
				Action:         "Set enable_key_rotation = true",
				SuggestedHCL:   newBody,
				PatchedContent: replaceResourceBlock(r.File, r, newBody),
				Matches:        matches,
			}
		}
	}
	// inject attribute before closing brace
	trimmed := strings.TrimRight(r.Body, " \n}")
	newBody := trimmed + "\n  enable_key_rotation = true\n}"
	return PatchResponse{
		Status: "modify_existing", FilePath: r.FilePath,
		Action:         "Add enable_key_rotation = true",
		SuggestedHCL:   newBody,
		PatchedContent: replaceResourceBlock(r.File, r, newBody),
		Matches:        matches,
	}
}

func extractBraceBlock(text string, openIdx int) string {
	depth := 0
	for i := openIdx; i < len(text); i++ {
		switch text[i] {
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return text[openIdx : i+1]
			}
		}
	}
	return text[openIdx:]
}

func validateSyntax(files []TfFile) error {
	for _, f := range files {
		_, diags := parseConfig(f)
		if diags.HasErrors() {
			return fmt.Errorf("%s: %s", f.Path, diags.Error())
		}
	}
	return nil
}
