/* ============================================================
   Student Insight — Smart Query v2
   Free-text-capable question matching + answer engine, layered on top
   of the same knowledge/smart-questions.json data file the original
   tap-only Smart Engine (js/smart-engine.js) uses. No new computation —
   every answer is read from existing APP analytics via computeKey paths
   already defined in that JSON. Everything runs on-device; nothing is
   sent anywhere.

   v2 adds:
   - Free-text matching (lightweight token-overlap scorer — no external
     fuzzy-match library; js/vendor/fuse.min.js does not exist in this
     repo, so this does not depend on it)
   - Ranked multi-result matching instead of single tap-to-answer
   - A stable API surface (window.SmartQueryV2) intended to be the data
     layer behind a future UI (e.g. the right-rail "ask a question"
     panel described in shell-redesign-plan.md — that UI is not part of
     this file)
============================================================ */

const SmartQueryV2 = (function(){

  let _bank = null;         // parsed knowledge/smart-questions.json
  let _loadPromise = null;

  /* ── Load & parse the question bank (same file smart-engine.js uses) ── */
  function load(){
    if(_loadPromise) return _loadPromise;
    _loadPromise = fetch("knowledge/smart-questions.json")
      .then(r => { if(!r.ok) throw new Error("smart-questions.json fetch failed: "+r.status); return r.json(); })
      .then(json => { _bank = json; return _bank; })
      .catch(err => { console.warn("[SmartQueryV2] failed to load question bank:", err); _bank = null; throw err; });
    return _loadPromise;
  }

  function isReady(){ return !!_bank; }

  /* ── Flatten categories → a single list of questions, each carrying
     its parent category's scope/requires down onto itself, so matching
     and answering don't need to re-walk the category tree every time. ── */
  function flatQuestions(){
    if(!_bank) return [];
    const out = [];
    (_bank.categories||[]).forEach(cat => {
      (cat.questions||[]).forEach(q => {
        out.push(Object.assign({}, q, {
          _categoryId: cat.id,
          _categoryLabel: cat.label,
          _scope: cat.scope||[],
          _requires: cat.requires||null
        }));
      });
    });
    return out;
  }

  /* ── Scope/requirement gating — same semantics as the tap-only engine:
     a question is only offered if it applies to the current mode
     (institution/individual) and its `requires` expression (a tiny,
     fixed vocabulary of guard conditions, evaluated against APP below)
     currently holds. ── */
  function currentMode(){
    return (window.APP && APP.setup && APP.setup.mode) || "institution";
  }

  function evalRequires(expr){
    if(!expr) return true;
    const students = (window.APP && APP.students) || [];
    const setup = (window.APP && APP.setup) || {};
    try{
      switch(expr){
        case "students.length>0": return students.length>0;
        case "students.length>=2": return students.length>=2;
        case "tests.length>=2": return (setup.tests||[]).length>=2;
        case "subjects.length>=2": return (setup.subjects||[]).length>=2;
        default:
          // Unknown guard string — fail open (question stays hidden)
          // rather than throwing, since this is data-driven and a typo
          // in the JSON shouldn't crash the whole engine.
          console.warn("[SmartQueryV2] unrecognized requires expression:", expr);
          return false;
      }
    }catch(e){
      console.warn("[SmartQueryV2] requires evaluation error:", expr, e);
      return false;
    }
  }

  function questionAiFeatureOk(q){
    if(!q.requiresAIFeature) return true;
    return !!(window.APP && APP.aiFeatures && APP.aiFeatures.has(q.requiresAIFeature));
  }

  function availableQuestions(){
    const mode = currentMode();
    return flatQuestions().filter(q =>
      (!q._scope.length || q._scope.indexOf(mode) !== -1) &&
      evalRequires(q._requires) &&
      questionAiFeatureOk(q)
    );
  }

  /* ── computeKey resolver ──────────────────────────────────────────
     Reads a dotted path off APP (e.g. "classStats.subjectWeakness"),
     with one extra convention: a "[]" segment maps the remaining path
     over an array (e.g. "students[].analysis.peerOutlier" → an array
     of {student, value} for every student that has a non-null value
     at that path). No new computation happens here — every value this
     touches was already computed elsewhere (compute-engine.js). ── */
  function getPath(obj, path){
    return path.split(".").reduce((o,k) => (o==null ? undefined : o[k]), obj);
  }

  function resolveComputeKey(key){
    if(!key) return undefined;
    const root = window.APP || {};
    const mapIdx = key.indexOf("[].");
    if(mapIdx === -1){
      return getPath(root, key);
    }
    const arrPath = key.slice(0, mapIdx);           // e.g. "students"
    const restPath = key.slice(mapIdx+3);           // e.g. "analysis.peerOutlier"
    const arr = getPath(root, arrPath);
    if(!Array.isArray(arr)) return undefined;
    return arr
      .map(item => ({ student: item, value: getPath(item, restPath) }))
      .filter(r => r.value !== undefined && r.value !== null);
  }

  /* ── Template filling — {placeholder} substitution against a flat
     vars object the caller builds per-question (answer-shaping logic
     necessarily differs per computeKey shape, same as the tap-only
     engine's design). ── */
  function fillTemplate(template, vars){
    if(!template) return "";
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, k) =>
      (vars && Object.prototype.hasOwnProperty.call(vars, k)) ? String(vars[k]) : m
    );
  }

  /* ── Per-question answer shaping. Each computeKey shape needs its own
     small mapping into template vars — this mirrors what the tap-only
     engine (js/smart-engine.js) already does per question, just
     centralized here so free-text matching and tap-answering share one
     answer path instead of diverging. Unrecognized/uncomputable
     questions fall back to unavailableMessage/emptyMessage from the
     JSON itself rather than a hardcoded string, so wording stays
     data-driven and translatable. ── */
  function answerQuestion(questionId){
    const q = flatQuestions().find(x => x.id === questionId);
    if(!q) return { ok:false, text: "That question isn't in the current question bank." };
    if(!questionAiFeatureOk(q)){
      return { ok:false, text: q.unavailableMessage || "This needs an AI feature that isn't enabled — turn it on from the AI panel first." };
    }
    if(q._requires && !evalRequires(q._requires)){
      return { ok:false, text: q.unavailableMessage || "Not enough data yet to answer this." };
    }

    const value = resolveComputeKey(q.computeKey);
    const vars = { name: (currentMode()==="individual" && window.APP && APP.students && APP.students[0]) ? APP.students[0].name : "" };

    if(value === undefined || value === null || (Array.isArray(value) && value.length===0)){
      return { ok:false, text: q.emptyMessage || q.unavailableMessage || "Nothing to report here yet — needs more data." };
    }

    // Shape-specific var extraction. Kept intentionally simple/explicit
    // rather than a generic deep-flattener, so each mapping is easy to
    // audit against its answerTemplate in knowledge/smart-questions.json.
    if(q.computeKey === "classStats.subjectWeakness" && Array.isArray(value)){
      const sorted = [...value].sort((a,b)=> (q.id==="strongest_subject" ? a.pctBelow-b.pctBelow : b.pctBelow-a.pctBelow));
      const top = sorted[0];
      if(!top) return { ok:false, text: q.emptyMessage || "No subject data available." };
      vars.topSubject = top.subject; vars.topPctBelow = top.pctBelow; vars.topAvg = top.avgClass;
      const spreadWide = sorted.length>1 && (sorted[0].pctBelow - sorted[sorted.length-1].pctBelow) > 20;
      vars.spreadNote = spreadWide ? (q.spreadNoteWide||"") : (q.spreadNoteNarrow||"");
      return { ok:true, text: fillTemplate(q.answerTemplate, vars) };
    }

    if(q.computeKey === "classStats.distribution" && typeof value === "object"){
      Object.assign(vars, value);
      return { ok:true, text: fillTemplate(q.answerTemplate, vars) };
    }

    if(q.computeKey === "classStats.attendanceCorrelation" && typeof value === "object"){
      vars.noAbsenceAvg = value.noAbsence ? value.noAbsence.avg : "";
      vars.someAbsenceAvg = value.someAbsence ? value.someAbsence.avg : "";
      return { ok:true, text: fillTemplate(q.answerTemplate, vars) };
    }

    if(q.computeKey === "genderAnalysis" && typeof value === "object"){
      if(value.gapPct === 0 || value.gapPct === undefined){
        return { ok:true, text: q.noGapMessage || "No meaningful gap found." };
      }
      Object.assign(vars, value);
      return { ok:true, text: fillTemplate(q.answerTemplate, vars) };
    }

    if(q.computeKey === "students[].analysis.peerOutlier" && Array.isArray(value)){
      if(!value.length) return { ok:false, text: q.emptyMessage || "No outliers detected." };
      vars.count = value.length;
      vars.names = value.slice(0,5).map(r=>r.student.name).join(", ");
      return { ok:true, text: fillTemplate(q.answerTemplate, vars) };
    }

    // Generic fallback: scalar or simple object value, spread directly
    // into template vars under its own key name plus a bare "value".
    if(typeof value === "object" && !Array.isArray(value)){
      Object.assign(vars, value);
    } else {
      vars.value = value;
    }
    return { ok:true, text: fillTemplate(q.answerTemplate, vars) };
  }

  /* ── Free-text matching ───────────────────────────────────────────
     Lightweight token-overlap scorer: tokenize the query, tokenize each
     available question's label (+ its category label), score by
     overlap count with a small bonus for domainVocabulary hits so
     on-topic phrasing ranks above incidental word matches. This is
     deliberately simple (no external library — see file header) rather
     than a full fuzzy-match; it's matching against a small (dozens,
     not thousands) fixed question set, not free-form documents. ── */
  function tokenize(s){
    return String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(Boolean);
  }

  function isOutOfDomain(queryTokens){
    if(!_bank || !Array.isArray(_bank.domainVocabulary) || !_bank.domainVocabulary.length) return false;
    const vocab = new Set(_bank.domainVocabulary.map(v=>v.toLowerCase()));
    return !queryTokens.some(t => vocab.has(t));
  }

  function match(queryText, limit){
    limit = limit || 5;
    if(!_bank) return { ok:false, results:[], deflected:false, text:"Question bank not loaded yet." };
    const qTokens = tokenize(queryText);
    if(!qTokens.length) return { ok:false, results:[], deflected:false, text:"" };

    if(isOutOfDomain(qTokens)){
      return { ok:false, results:[], deflected:true, text: _bank.deflectionMessage || "That's outside what I can help with." };
    }

    const candidates = availableQuestions();
    const scored = candidates.map(q => {
      const labelTokens = tokenize(q.label);
      const catTokens = tokenize(q._categoryLabel);
      let score = 0;
      qTokens.forEach(t => {
        if(labelTokens.indexOf(t) !== -1) score += 3;
        else if(catTokens.indexOf(t) !== -1) score += 1;
      });
      return { question: q, score };
    }).filter(r => r.score > 0);

    scored.sort((a,b) => b.score - a.score);
    const results = scored.slice(0, limit).map(r => ({
      id: r.question.id,
      label: r.question.label,
      category: r.question._categoryLabel,
      score: r.score
    }));

    if(!results.length){
      return { ok:false, results:[], deflected:true, text: _bank.deflectionMessage || "That's outside what I can help with." };
    }
    return { ok:true, results, deflected:false, text:"" };
  }

  /* ── Combined ask(): match then answer the top hit. Callers that want
     to show a disambiguation list (multiple plausible matches) should
     use match() directly and call answerQuestion(id) once the user
     picks one, rather than always taking the top-1 result via ask(). ── */
  function ask(queryText){
    const m = match(queryText, 1);
    if(!m.ok){
      return { ok:false, text: m.text || "I couldn't find a matching question — try rephrasing, or pick one from the list.", matched:null };
    }
    const top = m.results[0];
    const answer = answerQuestion(top.id);
    return { ok: answer.ok, text: answer.text, matched: top };
  }

  return {
    load,
    isReady,
    availableQuestions,
    answerQuestion,
    match,
    ask,
    // exposed for debugging / future UI layers, not part of the stable
    // "ask a question" contract above
    _resolveComputeKey: resolveComputeKey,
    _flatQuestions: flatQuestions
  };

})();

if(typeof window !== "undefined") window.SmartQueryV2 = SmartQueryV2;
