package main

import (
	"fmt"
	"strings"
)

type ScanRequest struct {
	CheckID    string   `json:"check_id"`
	BucketName string   `json:"bucket_name,omitempty"`
	KeyID      string   `json:"key_id,omitempty"`
	GroupID    string   `json:"group_id,omitempty"`
	GroupName  string   `json:"group_name,omitempty"`
	Files      []TfFile `json:"files"`
}

type ScanResponse struct {
	Status       string          `json:"status"`
	Message      string          `json:"message,omitempty"`
	CheckID      string          `json:"check_id,omitempty"`
	FilesScanned int             `json:"files_scanned"`
	Matches      []ResourceMatch `json:"matches,omitempty"`
	CanPatch     bool            `json:"can_patch"`
}

func scanRequest(req ScanRequest) ScanResponse {
	if len(req.Files) == 0 {
		return ScanResponse{Status: "error", Message: "no .tf/.hcl files provided"}
	}
	resources := parseAllResources(req.Files)
	var matches []ResourceMatch

	switch req.CheckID {
	case "s3.bucket.public_access_not_blocked":
		matches = scanS3Bucket(resources, req.BucketName)
	case "kms.key.no_rotation":
		matches = scanKmsKey(resources, req.KeyID)
	case "ec2.security_group.unrestricted_ssh", "ec2.security_group.unrestricted_rdp":
		matches = scanSecurityGroup(resources, req.GroupID, req.GroupName)
	default:
		return ScanResponse{
			Status:       "unsupported",
			CheckID:      req.CheckID,
			FilesScanned: len(req.Files),
			Message:      "repo scan not implemented for this check",
		}
	}

	if len(matches) == 0 {
		return ScanResponse{
			Status:       "not_found",
			CheckID:      req.CheckID,
			FilesScanned: len(req.Files),
			Message:      "no matching Terraform resource in scanned files",
			CanPatch:     false,
		}
	}
	canPatch := req.CheckID == "s3.bucket.public_access_not_blocked" || req.CheckID == "kms.key.no_rotation"
	return ScanResponse{
		Status:       "matched",
		CheckID:      req.CheckID,
		FilesScanned: len(req.Files),
		Matches:      matches,
		CanPatch:     canPatch,
	}
}

func scanS3Bucket(resources []ResourceBlock, bucketName string) []ResourceMatch {
	if bucketName == "" {
		return nil
	}
	var out []ResourceMatch
	for _, r := range resources {
		if r.Type != "aws_s3_bucket" {
			continue
		}
		attrs := attrsFromBody(r.Body)
		if attrs["bucket"] == bucketName || r.Name == bucketName {
			out = append(out, ResourceMatch{
				ResourceBlock: r,
				MatchReason:   fmt.Sprintf("bucket attribute %q or resource name", bucketName),
			})
		}
	}
	return out
}

func scanKmsKey(resources []ResourceBlock, keyID string) []ResourceMatch {
	if keyID == "" {
		return nil
	}
	var out []ResourceMatch
	for _, r := range resources {
		if r.Type != "aws_kms_key" && r.Type != "aws_kms_replica_key" {
			continue
		}
		attrs := attrsFromBody(r.Body)
		if strings.Contains(r.Body, keyID) || attrs["description"] == keyID || r.Name == keyID {
			out = append(out, ResourceMatch{
				ResourceBlock: r,
				MatchReason:   fmt.Sprintf("KMS key reference %q", keyID),
			})
		}
	}
	return out
}

func scanSecurityGroup(resources []ResourceBlock, groupID, groupName string) []ResourceMatch {
	var out []ResourceMatch
	for _, r := range resources {
		if r.Type != "aws_security_group" && r.Type != "aws_default_security_group" {
			continue
		}
		attrs := attrsFromBody(r.Body)
		name := attrs["name"]
		if groupName != "" && (name == groupName || r.Name == groupName) {
			out = append(out, ResourceMatch{
				ResourceBlock: r,
				MatchReason:   fmt.Sprintf("security group name %q", groupName),
			})
			continue
		}
		if groupID != "" && strings.Contains(r.Body, groupID) {
			out = append(out, ResourceMatch{
				ResourceBlock: r,
				MatchReason:   fmt.Sprintf("references group id %q", groupID),
			})
		}
	}
	return out
}
