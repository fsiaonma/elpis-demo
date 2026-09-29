// recall-go MCP server: skill normalization and deterministic job recall.
//
// Job data is always supplied by the caller (Node agent) in tool arguments.
// This process does not connect to a database, read t_job, or call other servers.
// Staying stateless keeps the layer safe to restart, test in isolation, and invoke
// concurrently without cross-request leakage — it only computes over inputs.
package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

const (
	protocolVersion = "2025-03-26"
	serverName      = "recall-go"
	serverVersion   = "0.1.0"
	defaultTopK     = 20
	maxConcurrency  = 8
	maxLineBytes    = 4 * 1024 * 1024
)

var (
	dictOnce sync.Once
	dict     *skillDict
	dictErr  error
)

type skillDict struct {
	aliasByNorm      map[string]aliasRecord
	aliasesByLenDesc []aliasRecord
	canonicals       map[string]struct{}
}

type aliasRecord struct {
	canonical   string
	norm        string
	displayAlias string
}

func main() {
	logStderr("recall-go ready")
	scanner := bufio.NewScanner(os.Stdin)
	buf := make([]byte, 64*1024)
	scanner.Buffer(buf, maxLineBytes)

	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var msg jsonRPCMessage
		if err := json.Unmarshal(line, &msg); err != nil {
			logStderr("invalid json-rpc message: " + err.Error())
			continue
		}
		handleMessage(msg)
	}
	if err := scanner.Err(); err != nil {
		logStderr("stdin read failed: " + err.Error())
	}
}

type jsonRPCMessage struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}

func handleMessage(msg jsonRPCMessage) {
	switch msg.Method {
	case "initialize":
		handleInitialize(msg.ID)
	case "notifications/initialized":
		return
	case "tools/list":
		handleToolsList(msg.ID)
	case "tools/call":
		handleToolsCall(msg.ID, msg.Params)
	default:
		if msg.Method != "" {
			sendError(msg.ID, -32601, "Method not found: "+msg.Method)
		}
	}
}

func handleInitialize(id json.RawMessage) {
	result := map[string]interface{}{
		"protocolVersion": protocolVersion,
		"capabilities": map[string]interface{}{
			"tools": map[string]interface{}{},
		},
		"serverInfo": map[string]interface{}{
			"name":    serverName,
			"version": serverVersion,
		},
	}
	sendResult(id, result)
}

func handleToolsList(id json.RawMessage) {
	sendResult(id, map[string]interface{}{
		"tools": []map[string]interface{}{
			{
				"name":        "normalize_skills",
				"description": "Normalize resume skill strings using skills.dict aliases.",
				"inputSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"skills": map[string]interface{}{
							"type":        "array",
							"items":       map[string]interface{}{"type": "string"},
							"description": "Raw skill strings from a resume",
						},
					},
					"required": []string{"skills"},
				},
			},
			{
				"name":        "recall_jobs",
				"description": "Deterministic coarse recall over caller-supplied jobs (no DB access).",
				"inputSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"resumeSkills": map[string]interface{}{
							"type":        "array",
							"items":       map[string]interface{}{"type": "string"},
							"description": "Resume skills (raw or normalized)",
						},
						"jobs": map[string]interface{}{
							"type": "array",
							"items": map[string]interface{}{
								"type": "object",
								"properties": map[string]interface{}{
									"jobId": map[string]interface{}{"type": "string"},
									"title": map[string]interface{}{"type": "string"},
									"requirements": map[string]interface{}{
										"type": "array",
										"items": map[string]interface{}{
											"type": "object",
											"properties": map[string]interface{}{
												"id":   map[string]interface{}{"type": "string"},
												"text": map[string]interface{}{"type": "string"},
												"kind": map[string]interface{}{"type": "string"},
											},
											"required": []string{"id", "text"},
										},
									},
								},
								"required": []string{"jobId", "requirements"},
							},
						},
						"topK": map[string]interface{}{
							"type":        "integer",
							"description": "Max results to return (default 20)",
						},
					},
					"required": []string{"resumeSkills", "jobs"},
				},
			},
		},
	})
}

type toolsCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

func handleToolsCall(id json.RawMessage, rawParams json.RawMessage) {
	var params toolsCallParams
	if len(rawParams) > 0 {
		if err := json.Unmarshal(rawParams, &params); err != nil {
			sendError(id, -32000, "invalid tools/call params: "+err.Error())
			return
		}
	}

	started := time.Now()
	toolName := params.Name
	logStderr(fmt.Sprintf("tools/call %s begin", toolName))

	var (
		result interface{}
		err    error
		scale  string
	)

	switch toolName {
	case "normalize_skills":
		var args normalizeSkillsArgs
		if err = decodeArgs(params.Arguments, &args); err == nil {
			scale = fmt.Sprintf("skills=%d", len(args.Skills))
			result, err = toolNormalizeSkills(args)
		}
	case "recall_jobs":
		var args recallJobsArgs
		if err = decodeArgs(params.Arguments, &args); err == nil {
			scale = fmt.Sprintf("jobs=%d resumeSkills=%d", len(args.Jobs), len(args.ResumeSkills))
			result, err = toolRecallJobs(args)
		}
	default:
		err = fmt.Errorf("unknown tool: %s", toolName)
	}

	elapsed := time.Since(started).Milliseconds()
	if err != nil {
		logStderr(fmt.Sprintf("%s %s %dms error=%s", toolName, scale, elapsed, err.Error()))
		sendError(id, -32000, err.Error())
		return
	}
	logStderr(fmt.Sprintf("%s %s %dms", toolName, scale, elapsed))
	sendResult(id, result)
}

func decodeArgs(raw json.RawMessage, dest interface{}) error {
	if len(raw) == 0 {
		return errors.New("arguments is required")
	}
	return json.Unmarshal(raw, dest)
}

type normalizeSkillsArgs struct {
	Skills []string `json:"skills"`
}

type normalizeSkillItem struct {
	Raw        string `json:"raw"`
	Normalized string `json:"normalized"`
	MatchedBy  string `json:"matchedBy"`
}

func toolNormalizeSkills(args normalizeSkillsArgs) ([]normalizeSkillItem, error) {
	d, err := loadSkillDict()
	if err != nil {
		return nil, err
	}
	out := make([]normalizeSkillItem, 0, len(args.Skills))
	for _, raw := range args.Skills {
		normalized, matchedBy := d.normalizeOne(raw)
		out = append(out, normalizeSkillItem{
			Raw:        raw,
			Normalized: normalized,
			MatchedBy:  matchedBy,
		})
	}
	return out, nil
}

type recallJobsArgs struct {
	ResumeSkills []string `json:"resumeSkills"`
	Jobs         []jobIn  `json:"jobs"`
	TopK         *int     `json:"topK"`
}

type jobIn struct {
	JobID        string           `json:"jobId"`
	Title        string           `json:"title"`
	Requirements []requirementIn  `json:"requirements"`
}

type requirementIn struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	Kind string `json:"kind"`
}

type recallJobsResult struct {
	Scanned int           `json:"scanned"`
	Results []jobRecallHit `json:"results"`
}

type jobRecallHit struct {
	JobID                   string   `json:"jobId"`
	Score                   int      `json:"score"`
	HitSkills               []string `json:"hitSkills"`
	MissSkills              []string `json:"missSkills"`
	MatchedRequirementIDs   []string `json:"matchedRequirementIds"`
}

func toolRecallJobs(args recallJobsArgs) (*recallJobsResult, error) {
	d, err := loadSkillDict()
	if err != nil {
		return nil, err
	}

	topK := defaultTopK
	if args.TopK != nil && *args.TopK > 0 {
		topK = *args.TopK
	}

	resumeSet := map[string]struct{}{}
	for _, sk := range args.ResumeSkills {
		canon, _ := d.normalizeOne(sk)
		if _, ok := d.canonicals[canon]; ok {
			resumeSet[canon] = struct{}{}
		}
	}

	jobs := args.Jobs
	scored := make([]jobRecallHit, len(jobs))

	workers := maxConcurrency
	if len(jobs) < workers {
		workers = len(jobs)
	}
	if workers <= 0 {
		return &recallJobsResult{Scanned: 0, Results: []jobRecallHit{}}, nil
	}

	sem := make(chan struct{}, workers)
	var wg sync.WaitGroup

	for i := range jobs {
		wg.Add(1)
		go func(idx int, job jobIn) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			scored[idx] = scoreJob(d, resumeSet, job)
		}(i, jobs[i])
	}
	wg.Wait()

	ranked := append([]jobRecallHit(nil), scored...)
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].Score != ranked[j].Score {
			return ranked[i].Score > ranked[j].Score
		}
		return ranked[i].JobID < ranked[j].JobID
	})

	if topK > len(ranked) {
		topK = len(ranked)
	}

	return &recallJobsResult{
		Scanned: len(jobs),
		Results: ranked[:topK],
	}, nil
}

func scoreJob(d *skillDict, resumeSet map[string]struct{}, job jobIn) jobRecallHit {
	required := map[string]struct{}{}
	matchedReqIDs := make([]string, 0)

	hardTotal := 0
	hardMatched := 0

	var coveredRunes, totalRunes int

	for _, req := range job.Requirements {
		skillsInReq := d.extractFromText(req.Text)
		for _, sk := range skillsInReq {
			required[sk] = struct{}{}
		}

		reqMatched := false
		for _, sk := range skillsInReq {
			if _, ok := resumeSet[sk]; ok {
				reqMatched = true
				break
			}
		}
		if reqMatched {
			matchedReqIDs = append(matchedReqIDs, req.ID)
		}

		if isHardKind(req.Kind) {
			hardTotal++
			if reqMatched {
				hardMatched++
			}
		}

		normText := normalizeKey(req.Text)
		totalRunes += len([]rune(normText))
		for _, sk := range skillsInReq {
			if _, ok := resumeSet[sk]; ok {
				coveredRunes += len([]rune(normalizeKey(sk)))
			}
		}
	}

	hit := make([]string, 0)
	miss := make([]string, 0)
	for sk := range required {
		if _, ok := resumeSet[sk]; ok {
			hit = append(hit, sk)
		} else {
			miss = append(miss, sk)
		}
	}
	sort.Strings(hit)
	sort.Strings(miss)
	sort.Strings(matchedReqIDs)

	hitCount := len(hit)
	coveragePct := 0
	if totalRunes > 0 {
		coveragePct = coveredRunes * 100 / totalRunes
		if coveragePct > 100 {
			coveragePct = 100
		}
	}

	hardPct := 0
	if hardTotal > 0 {
		hardPct = hardMatched * 100 / hardTotal
	}

	score := hitCount*10000 + hardPct*100 + coveragePct

	return jobRecallHit{
		JobID:                 job.JobID,
		Score:                 score,
		HitSkills:             hit,
		MissSkills:            miss,
		MatchedRequirementIDs: matchedReqIDs,
	}
}

func isHardKind(kind string) bool {
	return strings.EqualFold(strings.TrimSpace(kind), "hard")
}

func (d *skillDict) normalizeOne(raw string) (normalized, matchedBy string) {
	norm := normalizeKey(raw)
	if norm == "" {
		return raw, "unknown"
	}
	rec, ok := d.aliasByNorm[norm]
	if !ok {
		return raw, "unknown"
	}
	return rec.canonical, rec.displayAlias
}

func (d *skillDict) extractFromText(text string) []string {
	normText := normalizeKey(text)
	if normText == "" {
		return nil
	}
	masked := normText
	found := map[string]struct{}{}
	for _, rec := range d.aliasesByLenDesc {
		if rec.norm == "" {
			continue
		}
		if strings.Contains(masked, rec.norm) {
			found[rec.canonical] = struct{}{}
			masked = strings.ReplaceAll(masked, rec.norm, strings.Repeat("\x00", len(rec.norm)))
		}
	}
	out := make([]string, 0, len(found))
	for sk := range found {
		out = append(out, sk)
	}
	sort.Strings(out)
	return out
}

func normalizeKey(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func loadSkillDict() (*skillDict, error) {
	dictOnce.Do(func() {
		path, err := resolveDictPath()
		if err != nil {
			dictErr = err
			return
		}
		dict, dictErr = parseSkillDictFile(path)
	})
	return dict, dictErr
}

func resolveDictPath() (string, error) {
	candidates := []string{"skills.dict"}
	if exe, err := os.Executable(); err == nil {
		candidates = append([]string{filepath.Join(filepath.Dir(exe), "skills.dict")}, candidates...)
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", errors.New("skills.dict not found")
}

func parseSkillDictFile(path string) (*skillDict, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read skills.dict: %w", err)
	}

	aliasByNorm := map[string]aliasRecord{}
	canonicals := map[string]struct{}{}
	var aliasesByLenDesc []aliasRecord

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		canonical := strings.ToLower(fields[0])
		canonicals[canonical] = struct{}{}

		seenNorm := map[string]struct{}{}
		for _, token := range fields {
			norm := normalizeKey(token)
			if norm == "" {
				continue
			}
			if _, dup := seenNorm[norm]; dup {
				continue
			}
			seenNorm[norm] = struct{}{}

			display := token
			if strings.ToLower(token) == canonical {
				display = canonical
			}

			rec := aliasRecord{
				canonical:    canonical,
				norm:         norm,
				displayAlias: display,
			}
			if existing, ok := aliasByNorm[norm]; ok {
				if len(rec.norm) > len(existing.norm) {
					aliasByNorm[norm] = rec
				}
				continue
			}
			aliasByNorm[norm] = rec
			aliasesByLenDesc = append(aliasesByLenDesc, rec)
		}
	}

	if len(canonicals) == 0 {
		return nil, errors.New("skills.dict is empty")
	}

	sort.Slice(aliasesByLenDesc, func(i, j int) bool {
		if len(aliasesByLenDesc[i].norm) != len(aliasesByLenDesc[j].norm) {
			return len(aliasesByLenDesc[i].norm) > len(aliasesByLenDesc[j].norm)
		}
		return aliasesByLenDesc[i].norm < aliasesByLenDesc[j].norm
	})

	return &skillDict{
		aliasByNorm:      aliasByNorm,
		aliasesByLenDesc: aliasesByLenDesc,
		canonicals:       canonicals,
	}, nil
}

func sendResult(id json.RawMessage, result interface{}) {
	payload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      decodeID(id),
		"result":  result,
	}
	writeStdout(payload)
}

func sendError(id json.RawMessage, code int, message string) {
	payload := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      decodeID(id),
		"error": map[string]interface{}{
			"code":    code,
			"message": message,
		},
	}
	writeStdout(payload)
}

func decodeID(id json.RawMessage) interface{} {
	if len(id) == 0 || string(id) == "null" {
		return nil
	}
	var v interface{}
	if err := json.Unmarshal(id, &v); err != nil {
		return nil
	}
	return v
}

func writeStdout(payload interface{}) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(payload)
	os.Stdout.Write(buf.Bytes())
	os.Stdout.Sync()
}

func logStderr(msg string) {
	os.Stderr.WriteString(msg + "\n")
	os.Stderr.Sync()
}
