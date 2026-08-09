import { esc, toast } from './app-utils-init.js';
import { renderCompareOverview } from './compute-compare.js';
import { getStudentContinuityContext } from './compute-continuity.js';
import { computeAnalysis, computeExtraInsights } from './compute-stats.js';
import { openBucket, openIndividualBucket } from './render-buckets.js';
import { renderDashboard } from './render-core.js';
import { renderSmartSearchScreen } from './smart-engine-ui.js';
import { APP, COUNTRY_LANGUAGES, goStep, onLanguageChange } from './state-nav.js';
import { AI_FEATURES, renderAICheckboxes } from './template-upload.js';
import { renderShellLeftRail, renderShellRightRail } from './vs-shell.js';

/* ════════════════════════════════════════════════════════════════════
   RENDER-I18N — narrative text generators (trend facts, parent
   message, home/school plan, what-changed summary), the full
   SR_STRINGS_EN string table, language loading, i18n sweep/label
   lookup helpers.
   Split out of the former render-dashboard.js (review #5, 2588 lines
   was unmaintainable as one file) — pure move, no logic changed.
   Load order in index.html unchanged relative to before: this file
   loads first of the four, same position the old single file held.
   ════════════════════════════════════════════════════════════════════ */
/* ════ NARRATIVES ════
   Redesigned from a parent's actual reading experience, not just from what
   was easy to compute. The old six-card layout (Report Card Comment / For
   Parents / Strengths / Motivation / Study Plan / Intervention) repeated
   the same "scored X%, there's been a decline" sentence three times in
   slightly different words, used one flat encouraging tone regardless of
   how serious the situation actually was, and gave generic advice
   ("revise fundamentals, practice 30 min daily") that wasn't tied to which
   subject actually needed it. Replaced with:
     - parentMessage: ONE plain-language paragraph, tone genuinely scaled
       to severity (a bottom-of-class declining student reads very
       differently from a strong, improving one — no "good effort!" on a
       report that also says "at risk").
     - trendFacts: concrete numbers (which test, how many points, which
       test named "declining" actually shows it) instead of a vague label.
     - homePlan / schoolPlan: split by who actually does the action, each
       anchored to the specific weakest subject rather than a canned list.
   ════ */
// prompt-05-institution-rollup-narrative.md: shared phrasing helper for
// the optional 2nd `longitudinal` arg each of the 5 generators below now
// accepts — {periodCount,direction,streakLength,unitLabel} from
// getStudentContinuityContext() (compute-engine.js), or null/undefined.
// Gated on periodCount>=2 so a single-period file (where this is always
// null) or a first-year-in-the-data student never gets a fabricated
// trend sentence. `kind` picks phrasing weight — "trend"/"parent" spell
// out the streak, "home" only nudges tone, "plan" only escalates urgency
// for a school-facing recommendation.
function _ordinal(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}
function _pluralizeUnit(unit){return /[sxz]$|[cs]h$/i.test(unit)?unit+"es":unit+"s";}
function continuityNarrativeClause(longitudinal,kind){
  if(!longitudinal||!(longitudinal.periodCount>=2))return "";
  const{direction,streakLength,unitLabel}=longitudinal;
  const unitSingular=(unitLabel||"period").toLowerCase();
  const unit=_pluralizeUnit(unitSingular);
  if(direction==="flat")return kind==="trend"?` Looking back across ${longitudinal.periodCount} ${unit}, this has held roughly steady.`:"";
  if(direction==="declining"){
    if(kind==="trend")return ` This is the ${_ordinal(streakLength)} ${unitSingular} in a row of decline.`;
    if(kind==="parent")return ` This isn't a one-off — it's been slipping for ${streakLength} ${unit} running.`;
    if(kind==="plan")return ` Worth flagging: this is a multi-${unitSingular} decline, not an isolated bad test.`;
  }
  if(direction==="improving"){
    if(kind==="trend")return ` This continues a ${streakLength}-${unitSingular} improvement streak.`;
    if(kind==="parent")return ` — and this is sustained, not a one-test blip: ${streakLength} ${unit} of improvement in a row.`;
    if(kind==="home")return ` Worth noting this is a sustained multi-${unitSingular} improvement — whatever's been happening at home is working.`;
  }
  return "";
}
// Concrete, checkable trend facts instead of a vague "there has been a
// decline" — names the actual tests and the actual point swing, and is
// honest about a tie for weakest subject instead of arbitrarily picking one
// (the marks table right above this can show two subjects tied at the same
// %, so silently naming only one of them would look inconsistent).
// Shared by generateTrendFacts() and generateHomePlan(). Naming "the
// weakest subjects" only makes sense when it's a genuine minority of the
// subject list — if a student is struggling roughly evenly everywhere,
// the tie-for-lowest can end up covering every subject, and then telling
// a parent to focus "specifically" on all of them isn't specific at all.
// broad=true flags that degenerate case so callers can say something
// honest instead ("no single weak spot") rather than naming everything.
function weakestSubjectsInfo(st){
  const entries=Object.entries(st.analysis.subjectAvgs||{});
  if(!entries.length)return{entries,minVal:null,weakest:[],broad:false};
  const minVal=Math.min(...entries.map(([,v])=>v));
  const weakest=entries.filter(([,v])=>v===minVal).map(([s])=>s);
  const broad=entries.length>2&&weakest.length>=Math.ceil(entries.length*0.6);
  return{entries,minVal,weakest,broad};
}
function generateTrendFacts(st,longitudinal){
  const a=st.analysis,name=st.name.split(" ")[0];
  const points=(APP.setup.tests||[]).map((t,i)=>({name:t.name,val:a.testAvgs[i]})).filter(p=>p.val!==null&&p.val!==undefined);
  const{minVal,weakest,broad}=weakestSubjectsInfo(st);
  const weakBit=broad?` Struggling fairly evenly across every subject (~${minVal}%) — no single weak spot to point to.`
    :weakest.length?` Needs the most attention right now: ${weakest.join(" and ")} (${minVal}%).`:"";
  const longBit=continuityNarrativeClause(longitudinal,"trend");
  if(points.length<2)return(points.length===1?`Only one test on record so far (${points[0].name}: ${points[0].val}%) — not enough data yet for a trend.`:"No scored tests on record yet.")+weakBit+longBit;
  const first=points[0],last=points[points.length-1],delta=last.val-first.val;
  const dirWord=delta>3?"risen":delta<-3?"fallen":"stayed roughly steady";
  const deltaBit=Math.abs(delta)>3?` — a ${Math.abs(delta)}-point ${delta>0?"rise":"fall"} over ${points.length} tests`:"";
  return `${name} has ${dirWord} from ${first.val}% (${first.name}) to ${last.val}% (${last.name})${deltaBit}.${weakBit}${longBit}`;
}
function generateParentMessage(st,longitudinal){
  const a=st.analysis,name=st.name.split(" ")[0];
  const atRisk=(st.flags||[]).some(f=>f.type==="at-risk");
  const longBit=continuityNarrativeClause(longitudinal,"parent");
  // Tone genuinely changes by severity instead of a flat "good effort!"
  // regardless of how serious the flags on the same report say it is.
  if(atRisk&&a.trend==="declining")return `${name} is currently in the bottom band of the class at ${a.overallAvg}%, and scores have been falling test over test.${longBit} This needs real attention now, not just more of the same studying. We'd like to sit down together — parents and teacher — this week to agree on a plan.`;
  if(a.trend==="declining")return `${name} scored ${a.overallAvg}% this term, and there's a downward trend worth catching early.${longBit} Nothing alarming yet, but it's the right time for some extra support at home before it compounds.`;
  if(a.overallAvg>=80)return `${name} is performing strongly at ${a.overallAvg}%${a.trend==="improving"?", and still improving":""}.${longBit} Keep doing what's working — this is a good stage to add some stretch rather than more repetition.`;
  if(a.trend==="improving")return `${name} is at ${a.overallAvg}% and moving in the right direction.${longBit} Keep the current routine going — consistency is what's paying off here.`;
  return `${name} is holding steady at ${a.overallAvg}%. No red flags, but there's room to push further with focused practice.`;
}
// Split by who actually does the action — a parent reading "practice 30 min
// daily" has no idea if that's meant for home or school. homePlan is what
// the family can do; schoolPlan (Institution mode only) is what the
// teacher/school is doing or recommending, merged from the old separate
// Study Plan + Intervention Note (which frequently repeated each other).
function generateHomePlan(st,longitudinal){
  const name=st.name.split(" ")[0];
  const{minVal,weakest,broad}=weakestSubjectsInfo(st);
  const longBit=continuityNarrativeClause(longitudinal,"home");
  if(!weakest.length||minVal>=70)return `Keep up the current routine — nothing specific needs fixing at home right now.${longBit}`;
  if(broad)return `This week: struggling roughly evenly across every subject means there's no single fix — rotate, one subject per day (20–30 min), and spend that time on fundamentals rather than more practice volume. Trying to cover everything at once usually fixes nothing.`;
  return `This week: 20–30 min/day on ${weakest.join(" and ")} specifically, not general revision. Have ${name} explain one solved problem out loud each day — that surfaces real gaps faster than more worksheets.`;
}
// TASK (Project Bible v2 §5, "What changed since last test" one-liner):
// the doc suggested reusing subjectDeltas — checked it first and that
// field is actually "this student's subject average vs the CLASS
// average," computed in computeExtraInsights() in compute-engine.js. In
// Individual mode there's no class to compare against, so that value is
// always exactly 0 there — not usable for a last-test comparison, and
// misleading even in institution mode (a 0 there means "average for the
// class," not "no change since last test"). Computing the real
// last-vs-previous-test delta fresh instead, straight from raw per-test
// marks — same Math.min(mv,mx) clamping and maxMarks fallback
// computeAnalysis() already uses per test, so the numbers agree.
// TASK (Project Bible v2 §5, "Shareable single-insight image"): "Render
// one insight card (e.g. the parent message + trend chart) to a
// downloadable PNG via canvas, for sharing outside the app. Read-only
// rendering of existing fields." No new computation — generateParentMessage,
// generateWhatChangedSummary, and the already-rendered Chart.js trend
// canvas are all reused as-is. Colors below are the hex values behind
// this app's own --c-primary/--c-text/etc CSS variables (Canvas 2D can't
// read CSS custom properties directly), kept in sync by hand — if the
// palette in css/core.css's :root block ever changes, update here too.
function wrapCanvasText(ctx,text,maxWidth){
  const words=text.split(" ");
  const lines=[];let line="";
  words.forEach(w=>{
    const test=line?line+" "+w:w;
    if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w;}
    else line=test;
  });
  if(line)lines.push(line);
  return lines;
}
function shareInsightAsImage(studentId){
  const st=APP.students.find(s=>s.id===studentId);if(!st)return;
  const a=st.analysis||{};
  const srcChart=document.getElementById("bucket-chart-student-trend");
  const W=800,PAD=40;
  const measureCanvas=document.createElement("canvas");
  const mctx=measureCanvas.getContext("2d");
  const parentMsg=generateParentMessage(st,getStudentContinuityContext(st.id));
  const whatChanged=generateWhatChangedSummary(st,getStudentContinuityContext(st.id));
  mctx.font="15px Inter, sans-serif";
  const msgLines=wrapCanvasText(mctx,parentMsg,W-PAD*2);
  mctx.font="italic 13px Inter, sans-serif";
  const changedLines=wrapCanvasText(mctx,whatChanged,W-PAD*2);
  const headerH=90,nameH=66,msgH=msgLines.length*22+8,changedH=changedLines.length*19+24;
  const chartAspect=(srcChart&&srcChart.width)?srcChart.height/srcChart.width:0.5;
  const chartDrawH=srcChart?(W-PAD*2)*chartAspect:0;
  const footerH=46;
  const H=headerH+nameH+msgH+changedH+chartDrawH+footerH+PAD;
  const canvas=document.createElement("canvas");
  canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#2b3a67";ctx.fillRect(0,0,W,headerH);
  ctx.fillStyle="#ffffff";ctx.font="700 20px 'Source Serif 4', serif";ctx.textBaseline="alphabetic";
  ctx.fillText("Student Insight — Progress Report",PAD,headerH/2-4);
  ctx.font="12px Inter, sans-serif";ctx.fillStyle="rgba(255,255,255,.85)";
  ctx.fillText(new Date().toLocaleDateString(bcp47TagFor(window.SR_LANG)),PAD,headerH/2+18);
  let y=headerH+40;
  ctx.fillStyle="#1a1d2e";ctx.font="700 24px 'Source Serif 4', serif";
  ctx.fillText(st.name,PAD,y);
  y+=28;
  ctx.font="600 15px Inter, sans-serif";ctx.fillStyle="#5a607a";
  ctx.fillText(`Overall: ${a.overallAvg}%  ·  Grade ${a.grade||"-"}  ·  Trend: ${a.trend||"-"}`,PAD,y);
  y+=32;
  ctx.font="15px Inter, sans-serif";ctx.fillStyle="#1a1d2e";
  msgLines.forEach(l=>{ctx.fillText(l,PAD,y);y+=22;});
  y+=10;
  ctx.font="italic 13px Inter, sans-serif";ctx.fillStyle="#5a607a";
  changedLines.forEach(l=>{ctx.fillText(l,PAD,y);y+=19;});
  y+=18;
  if(srcChart){
    ctx.drawImage(srcChart,PAD,y,W-PAD*2,chartDrawH);
    y+=chartDrawH+20;
  }
  ctx.strokeStyle="#e2e5f1";ctx.beginPath();ctx.moveTo(PAD,y);ctx.lineTo(W-PAD,y);ctx.stroke();
  y+=22;
  ctx.font="11px Inter, sans-serif";ctx.fillStyle="#9ba4c0";
  ctx.fillText("Privacy-first, offline analysis — nothing in this report was ever uploaded anywhere.",PAD,y);
  canvas.toBlob(function(blob){
    if(!blob){toast("Couldn't generate the image — try again.","warn");return;}
    const url=URL.createObjectURL(blob);
    const dl=document.createElement("a");
    dl.href=url;
    dl.download=(st.name||"student").replace(/[^\w\s-]/g,"").replace(/\s+/g,"_")+"_progress_report.png";
    document.body.appendChild(dl);dl.click();document.body.removeChild(dl);
    setTimeout(()=>URL.revokeObjectURL(url),2000);
    toast("Image downloaded — ready to share.","success");
  },"image/png");
}
function generateWhatChangedSummary(st,longitudinal){
  const a=st.analysis,name=st.name.split(" ")[0];
  const tests=APP.setup.tests||[],subjects=APP.setup.subjects||[];
  const validIdx=[];
  (a.testAvgs||[]).forEach((v,i)=>{if(v!==null&&v!==undefined)validIdx.push(i);});
  if(validIdx.length<2)return `Not enough test history yet to compare — need at least 2 scored tests (currently ${validIdx.length}).`;
  const prevI=validIdx[validIdx.length-2],lastI=validIdx[validIdx.length-1];
  const prevTest=tests[prevI],lastTest=tests[lastI];
  const overallDelta=a.testAvgs[lastI]-a.testAvgs[prevI];
  function subjPct(testIdx,subject){
    const t=tests[testIdx],td=st.testData[t.name]||{marks:{}};
    const m=td.marks[subject];if(m===null||m===undefined||m==="")return null;
    const mx=(t.maxMarks&&t.maxMarks[subject])||100;
    return Math.round((Math.min(parseFloat(m)||0,mx)/mx)*100);
  }
  let biggest=null;
  subjects.forEach(s=>{
    const p1=subjPct(prevI,s),p2=subjPct(lastI,s);
    if(p1===null||p2===null)return;
    const d=p2-p1;
    if(!biggest||Math.abs(d)>Math.abs(biggest.d))biggest={subject:s,d};
  });
  const overallDir=overallDelta>0?"up":overallDelta<0?"down":"unchanged";
  const overallBit=overallDelta===0?`stayed at ${a.testAvgs[lastI]}% overall`:`went ${overallDir} ${Math.abs(overallDelta)} point${Math.abs(overallDelta)===1?"":"s"} overall (${a.testAvgs[prevI]}% → ${a.testAvgs[lastI]}%)`;
  const subjBit=(biggest&&biggest.d!==0)?`, mainly driven by ${biggest.subject} (${biggest.d>0?"+":""}${biggest.d})`:"";
  const longBit=continuityNarrativeClause(longitudinal,"trend");
  return `Since ${prevTest.name}, ${name} has ${overallBit}${subjBit}.${longBit}`;
}
function generateSchoolPlan(st,longitudinal){
  const a=st.analysis;
  const RISK_TYPES=["data-error","at-risk","first-below-pass","declining","sharp-drop","absent","volatile","burnout","data-gap"];
  const riskFlags=(st.flags||[]).filter(f=>RISK_TYPES.includes(f.type));
  if(!riskFlags.length)return null; // nothing to report — omit instead of padding with "no intervention needed"
  const flags=riskFlags.map(f=>f.label).join(", ");
  const longBit=continuityNarrativeClause(longitudinal,"plan");
  return `Flags: ${flags}. `+(a.stressScore>=60?"High stress indicators — recommend a one-on-one check-in. ":"")+"Suggested: parent-teacher meeting, targeted practice material, close monitoring on the next test."+longBit;
}

/* ════ DASHBOARD ════ */
function renderDataIssueBanner(){
  const issues=APP.dataIssues||[];
  const el=document.getElementById("data-issue-banner");
  if(!el)return;
  if(!issues.length){el.style.display="none";return;}
  const rows=issues.map(i=>i.scaleMismatch?`<b>Possible scale mismatch:</b> ${esc(i.message)}`:`${esc(i.studentName)} — ${esc(i.subject)} (${esc(i.test)}): ${esc(i.message)}`).join("<br>");
  el.innerHTML=`<b>⚠ Data quality issue${issues.length>1?"s":""} found (${issues.length}):</b> some mark cells couldn't be trusted as-is — see below. Please correct the source sheet and re-import. Export is disabled until these are fixed.<div style="max-height:220px;overflow-y:auto;margin-top:8px;padding-right:6px;border-top:1px solid #f5c6c1">${rows}</div>`;
  el.style.display="block";
}
/* ════ SMART REVEAL — buckets(A) / filtered list(B) / full answer(C) ════
   BUCKETS_SCOPE: Institution mode, non-Compare only. Compare Mode and
   Individual mode fall straight through to the pre-existing full
   renderDashboard() body (#legacy-dashboard-body) — the bucket model
   ("My Whole Class" / "Who Needs Help" etc.) presumes a multi-student
   class cohort, which doesn't apply to either of those modes. Revisit
   if/when a Compare- or Individual-specific bucket set is designed.
   Presentation-layer only — no new analytics; reuses st.analysis /
   st.analysis.explainedWarnings / APP.classStats exactly as computed by
   the existing engine. See BUILD spec student-insight-smart-reveal for
   the full design decisions this implements. */

// i18n discipline (PIB spec §4): every user-facing string here is a
// tag-key lookup through srT(), never concatenated, even though only an
// English table is populated now — this is Phase 5 scaffolding done
// up-front rather than retrofitted later.
// AUTO-SYNCED from i18n/en.json (root-cause fix for the raw-key-name bug —
// see loadLanguage() below: this inline copy is what actually renders on
// the very first synchronous paint, AND is the only thing that renders at
// all when fetch(i18n/en.json) fails outright (e.g. opened as a local
// file:// page — a first-class supported use case, see About §2 'A local
// HTML file' — file:// blocks fetch() of sibling files in most browsers).
// A hand-curated *subset* here silently drifts from en.json and reappears
// as raw key names on screen the moment the fetch can't complete. Keep
// this block and i18n/en.json in sync on every string change — regenerate
// with: python3 scripts/sync-sr-strings-en.py (see that file).
// AUTO-SYNCED from i18n/en.json (root-cause fix for the raw-key-name bug —
// see loadLanguage() below: this inline copy is what actually renders on
// the very first synchronous paint, AND is the only thing that renders at
// all when fetch(i18n/en.json) fails outright (e.g. opened as a local
// file:// page — a first-class supported use case, see About §2 'A local
// HTML file' — file:// blocks fetch() of sibling files in most browsers).
// A hand-curated *subset* here silently drifts from en.json and reappears
// as raw key names on screen the moment the fetch can't complete. Keep
// this block and i18n/en.json in sync on every string change — regenerate
// with: python3 scripts/sync-sr-strings-en.py (see that file).
const SR_STRINGS_EN={
  _comment:"English string table — the authoritative source for translation. This is the SAME content kept inline in js/render-dashboard.js (SR_STRINGS_EN) as an emergency fallback per PIB SPLIT_STATIC/i18n rules — if this file fails to fetch, the app still works in English using the inline copy. Do not let the two drift: this file mirrors SR_STRINGS_EN exactly. SCOPE NOTE: this covers only the ~18 pre-existing Smart Reveal bucket strings plus the newer Smart Search strings added in Phase 2/3 — it is NOT a full extraction of every user-facing string in the app (setup forms, FAQ, export screens, etc. are still hardcoded English throughout index.html/js/*.js). Full extraction is future work, not done here — see handoff doc.",
  about_bio_desc:"Educator and builder based in India, working on free, privacy-first tools that give teachers, institutions, and parents back control of their own data — Student Insight is one of them, built as a social cause rather than a product.",
  about_bio_email_btn:"sandeep@hakki.in",
  about_bio_kicker:"Who built this",
  about_bio_name:"Sandeep S Hakki",
  about_bio_projectpage_btn:"Project Page",
  about_builtby:"Built by Sandeep Hakki",
  about_eyebrow:"Student Insight — About",
  about_formulas_btn:"See Exact Formulas →",
  about_formulas_desc:"Every average, rank, percentile, trend and composite score, written out as exact formulas — for the maths/statistics/analytics people your institute will ask.",
  about_formulas_title:"Want to verify the maths yourself?",
  about_hero_sub:"Student Insight is the StudIn analytic tool that turns a spreadsheet of marks into ranks, trends, at-risk flags, and plain-language findings — without ever asking you to hand your data to a server first. Unlike traditional web applications that require user accounts, cloud storage, or centralized databases, Student Insight is designed as a completely stateless, privacy-first analytics platform. The application itself never becomes the owner of your data. Instead, it serves as an intelligent processing engine that transforms your spreadsheets into meaningful educational insights while keeping complete control in your hands.",
  about_hero_title:"You have students' marks. <span style=\"color:#2ec4b6\">Let's build meaningful insight from them.</span>",
  about_philosophy_cite:"Our Philosophy",
  about_philosophy_quote:"Student Insight is a privacy-first, offline education analytics platform where educators own their data, projects live in user-controlled files, and the application serves only as an intelligent analysis engine.",
  about_sec1_p1:"Student Insight never treats the browser as permanent storage.",
  about_sec1_p2:"Your data is stored only in files that you own.",
  about_sec1_p3:"Every project can be imported, analyzed, updated, exported, shared, archived, or backed up without depending on an online account or remote server.",
  about_sec1_p4:"If you move to another computer, your project moves with you. If you disconnect from the internet, your project continues to work.",
  about_sec1_p5:"<strong>Your data remains yours.</strong>",
  about_sec1_title:"Your Data Always Belongs to You",
  about_sec2_host1:"GitHub Pages",
  about_sec2_host2:"A local HTML file",
  about_sec2_host3:"A USB drive",
  about_sec2_host4:"A school intranet",
  about_sec2_host5:"An offline classroom computer",
  about_sec2_p1:"Student Insight is intentionally designed to run from a single static website. It works equally well whether it is opened from:",
  about_sec2_p2:"No installation. No server. No database. No subscriptions. No vendor lock-in.",
  about_sec2_title:"Built for GitHub Pages and Static Hosting",
  about_sec3_no1:"User accounts",
  about_sec3_no2:"Cloud synchronization",
  about_sec3_no3:"Remote databases",
  about_sec3_no4:"Cookies or fingerprinting",
  about_sec3_no5:"Personal data collection",
  about_sec3_no6:"Background uploads of your files",
  about_sec3_p1:"Educational records are among the most sensitive types of information.",
  about_sec3_p2:"Student Insight is designed so that student information never needs to leave the educator's device. The application does not require:",
  about_sec3_p3:"The browser simply processes the data that you choose to open — your uploaded spreadsheets and student records never leave your device.",
  about_sec3_p4:"To understand how many people use Student Insight, the site uses <strong>Cloudflare Web Analytics</strong> — a cookieless, aggregate-only visit counter that does not use fingerprinting and collects no personal data. It only ever sees anonymous page-view counts, never anything from the files you upload or analyze.",
  about_sec3_title:"Privacy by Design",
  about_sec4_p1:"Traditional systems store information inside databases. Student Insight stores knowledge inside educator-owned project files.",
  about_sec4_p2:"The application can always reconstruct the complete working environment from those files.",
  about_sec4_p3:"Nothing important depends on browser memory. Nothing important depends on server storage.",
  about_sec4_p4:"This carries through the whole academic year, not just a single test. As Test 2 and Test 3 come in, the same file grows to hold them — the Setup step can load an already-filled sheet and add the next test's columns onto it directly, so nothing already recorded is ever re-entered or discarded along the way.",
  about_sec4_p5:"<strong>Your project remains portable, transparent, and future-proof.</strong>",
  about_sec4_title:"Your Spreadsheet is the Source of Truth",
  about_sec5_chip1:"Schools",
  about_sec5_chip2:"Colleges",
  about_sec5_chip3:"Universities",
  about_sec5_chip4:"Coaching Centres",
  about_sec5_chip5:"Individual Tutors",
  about_sec5_chip6:"Training Institutes",
  about_sec5_chip7:"Online Learning Programs",
  about_sec5_chip8:"Parents",
  about_sec5_chip9:"Self-Prep Aspirants",
  about_sec5_p1:"Its architecture is designed to support:",
  about_sec5_title:"Designed for Every Educational Institution — and Individuals",
  about_sec6_p1:"Student Insight is not another student management system. Its purpose is to help educators understand learning.",
  about_sec6_p2:"The goal is not simply to collect data.",
  about_sec6_p3:"<strong>The goal is to transform educational data into educational intelligence.</strong>",
  about_sec6_title:"Beyond Marks and Attendance",
  about_sec7_col1:"Every educator or parent accesses the same application.<br>Every user owns their own data.<br>Every project remains independent.",
  about_sec7_col2:"No shared sessions.<br>No shared storage.<br>No hidden cloud dependency.",
  about_sec7_col3:"The application is temporary.<br><br>Your project is permanent.",
  about_sec7_title:"Offline First. Stateless by Design.",
  about_sec8_p1:"Because Student Insight is built around open file formats and user-owned data, everyone remains free to archive, migrate, or extend their projects without being tied to proprietary infrastructure.",
  about_sec8_title:"Open, Portable and Future Ready",
  about_stat_cost:"Cost, forever",
  about_stat_license_label:"Open source licence",
  about_stat_offline:"Offline capable",
  about_stat_servers:"Servers involved",
  ai_anxiety_flag_label:"Anxiety Flag",
  ai_anxiety_flag_sub:"Pattern of consistent underperformance suggesting anxiety",
  ai_at_risk_label:"At-Risk Detection",
  ai_at_risk_sub:"Scored below pass threshold in any subject",
  ai_avg_label:"Subject-wise Average",
  ai_avg_sub:"Mean marks per subject per test",
  ai_burnout_risk_label:"Burnout Risk",
  ai_burnout_risk_sub:"Declining performance after previous high scores",
  ai_chronic_absent_label:"Chronic Absenteeism",
  ai_chronic_absent_sub:"Exceeds absence threshold near test dates",
  ai_class_difficulty_label:"Class Difficulty Flag",
  ai_class_difficulty_sub:"Subject where >40% of class is struggling",
  ai_class_health_label:"Class Health Score",
  ai_class_health_sub:"Overall class performance index 0–100",
  ai_competitive_readiness_label:"Competitive Readiness",
  ai_competitive_readiness_sub:"Readiness signal for entrance exams (JEE/NEET/IAS)",
  ai_consistency_label:"Consistency Score",
  ai_consistency_sub:"Low variance = consistent; high = unpredictable",
  ai_cumulative_label:"Cumulative Average",
  ai_cumulative_sub:"Running average across all tests to date",
  ai_diversity_analysis_label:"Gender & Group Analysis",
  ai_diversity_analysis_sub:"Performance patterns across gender groups",
  ai_early_warning_label:"Early Warning Score",
  ai_early_warning_sub:"Composite risk score for proactive intervention",
  ai_engagement_index_label:"Engagement Index",
  ai_engagement_index_sub:"Proxy for class engagement via attendance + trend",
  ai_grade_label:"Grade Assignment",
  ai_grade_sub:"A/B/C/D/F by percentage bands",
  ai_growth_rate_label:"Growth Rate",
  ai_growth_rate_sub:"Score velocity — how fast improving or declining",
  ai_intervention_label:"Intervention Note",
  ai_intervention_priority_label:"Intervention Priority List",
  ai_intervention_priority_sub:"Ranked list of students needing immediate support",
  ai_intervention_sub:"Teacher guidance for at-risk students",
  ai_motivation_label:"Motivational Message",
  ai_motivation_sub:"Personalised encouragement based on trend",
  ai_multiple_fails_label:"Multiple Subject Failures",
  ai_multiple_fails_sub:"Failing in 2 or more subjects simultaneously",
  ai_parent_summary_label:"Parent-Friendly Summary",
  ai_parent_summary_sub:"Plain-language progress narrative for parents",
  ai_pct_label:"Percentage Calculation",
  ai_pct_sub:"% score per subject and overall",
  ai_peer_outlier_label:"Peer Outlier",
  ai_peer_outlier_sub:"Performing unusually above or below peer group",
  ai_percentile_label:"Percentile Calculation",
  ai_percentile_sub:"Where student stands within the class",
  ai_plateau_label:"Plateau Detection",
  ai_plateau_sub:"No improvement across 3+ consecutive tests",
  ai_prediction_label:"Next Test Prediction",
  ai_prediction_sub:"Projected score from trend (2+ tests)",
  ai_progress_narrative_label:"Progress Narrative",
  ai_progress_narrative_sub:"Story of the student's journey across all tests",
  ai_rank_label:"Class Ranking",
  ai_rank_sub:"Rank 1–N by overall average",
  ai_resilience_score_label:"Resilience Score",
  ai_resilience_score_sub:"Ability to recover after a drop — positive rebound",
  ai_sharp_drop_label:"Sharp Drop Alert",
  ai_sharp_drop_sub:"Sudden marks drop ≥ configurable % between tests",
  ai_strengths_letter_label:"Strengths Letter",
  ai_strengths_letter_sub:"Highlight what the student excels at",
  ai_stress_score_label:"Stress Indicator",
  ai_stress_score_sub:"Composite score from volatility, absences & trend",
  ai_study_plan_label:"Study Plan",
  ai_study_plan_sub:"Targeted recommendations for weak subjects",
  ai_subject_audit_label:"Subject Audit",
  ai_subject_audit_sub:"Which subjects need curriculum or teaching review",
  ai_subject_collapse_label:"Subject Collapse",
  ai_subject_collapse_sub:"Was strong, now suddenly failing in a subject",
  ai_subject_strength_label:"Subject Strength & Weakness",
  ai_subject_strength_sub:"Best and weakest subject per student",
  ai_teacher_remarks_ai_label:"AI Remark Sentiment",
  ai_teacher_remarks_ai_sub:"Classify teacher remarks as positive / neutral / concern",
  ai_test_difficulty_label:"Test Difficulty Analysis",
  ai_test_difficulty_sub:"Was the test too hard or too easy vs class history",
  ai_topper_gap_label:"Topper Gap Analysis",
  ai_topper_gap_sub:"How far each student is from class topper",
  ai_trend_label:"Performance Trend",
  ai_trend_sub:"Improving / Stable / Declining across tests",
  ai_volatile_label:"Volatile Performance",
  ai_volatile_sub:"High score variance — inconsistent pattern",
  ai_wellbeing_summary_label:"Wellbeing Summary",
  ai_wellbeing_summary_sub:"Class-level psychosocial overview for teacher",
  ai_year_projection_label:"Year-End Projection",
  ai_year_projection_sub:"Projected final scores based on current trajectory",
  back:"← Back",
  insights_nav_label:"Insights",
  export_section_title:"Generate &amp; Export Reports",
  shell_right_generate_zip:"Generate & Download ZIP",
  bucket_all_good:"All good — no concerns here right now.",
  bucket_back_to_dashboard:"← Insights",
  bucket_class_desc:"Overall average, trend, and class-wide patterns",
  bucket_class_label:"My Whole Class",
  bucket_clusters_desc:"Cohort patterns found across average, consistency, trend and attendance",
  bucket_clusters_label:"Performance Groups",
  bucket_compare_report_desc:"One management-level PDF ranking every section side by side",
  bucket_compare_report_label:"Section Comparison Report",
  bucket_count_badge_one:"({{count}} found)",
  bucket_count_badge_other:"({{count}} found)",
  bucket_export_desc:"One click — everything, no choices to make",
  bucket_export_label:"Export Reports",
  bucket_help_desc:"Students who may need extra support",
  bucket_help_label:"Who Needs Help",
  bucket_persection_desc:"Student/Teacher/Management PDFs for one section at a time",
  bucket_persection_label:"Per-Section Reports",
  bucket_smart_desc:"Ask anything about this class in plain language",
  bucket_smart_label:"Smart Search ✨",
  bucket_student_desc:"Look up any student by name",
  bucket_student_label:"One Student",
  bucket_subject_desc:"See how the whole class did in one subject",
  bucket_subject_label:"One Subject",
  bucket_top_desc:"Highest scorers and most improved",
  bucket_top_label:"Top Performers",
  faq_audience_finance:"For the Admin / Office",
  faq_audience_formulas:"Exact Formulas & Calculation Logic",
  faq_audience_it:"From the IT-in-charge",
  faq_audience_nitpicky:"The Nitpicky (But Real) Ones",
  faq_audience_parent:"Parent-Facing Concerns",
  faq_audience_principal:"From the Principal",
  faq_audience_teacher:"From a Regular Teacher",
  faq_audience_terms:"Terms & Abbreviations Used in the App",
  faq_audience_vp:"From the VP / Academic Coordinator",
  faq_cnt_finance:"Budget & paperwork",
  faq_cnt_formulas:"For maths/statistics/analytics reviewers — every number, in writing",
  faq_cnt_it:"Hosting & data location",
  faq_cnt_nitpicky:"You'll actually hear these",
  faq_cnt_parent:"What the principal anticipates",
  faq_cnt_principal:"Money, liability, reputation",
  faq_cnt_teacher:"The actual daily user",
  faq_cnt_terms:"What every label actually means",
  faq_cnt_vp:"Process & control",
  faq_empty:"No questions match your search. Try a different word.",
  faq_hero_eyebrow:"Frequently Asked Questions",
  faq_hero_sub:"These are the actual questions principals, coordinators, IT staff and teachers ask when this tool is proposed to them — from serious procurement concerns down to the nitpicky ones. Every answer below reflects exactly what the app does today. Where something isn't built yet, that's stated plainly rather than glossed over.",
  faq_hero_title:"You have students' marks. Here's exactly how the StudIn analytic tool <span style=\"color:#2ec4b6\">turns them into insight —</span> answered honestly, not persuasively.",
  faq_jump_formulas:"Jump straight to Exact Formulas & Calculation Logic (for maths/stats reviewers)",
  faq_search_placeholder:"Search questions — e.g. 'data', 'offline', 'cost', 'save'...",
  faq_tag_admin:"Admin",
  faq_tag_appdefined:"App-defined",
  faq_tag_core:"Core",
  faq_tag_practical:"Practical",
  faq_tag_serious:"Serious",
  faq_tag_silly:"Silly",
  faq_tag_statistics:"Statistics",
  faq_tag_technical:"Technical",
  finding_top_rank:"{{student}} is ranked #{{rank}} in the class.",
  home_hero_sub:"Upload a filled Excel workbook and Student Insight identifies learning gaps, flags at-risk students, tracks progress over time, and generates ready-to-share reports — computed instantly, entirely in your browser, with your data never uploaded anywhere.",
  home_hero_title:"Turn your students' marks into actionable insight",
  home_upload_sub:"Drop your class's filled Excel file below. Managing more than one section or batch? Drop 2 or more files at once — matching ones are compared automatically, and any that don't match still get their own individual analysis.",
  home_upload_title:"Upload Your Filled Sheet",
  individual_bucket_plan_desc:"What to focus on at home this week",
  individual_bucket_plan_label:"Recommendations",
  individual_bucket_report_desc:"Overall summary, trend and where things stand",
  individual_bucket_report_label:"Progress Report",
  individual_bucket_subjects_desc:"Test-by-test marks and subject breakdown",
  individual_bucket_subjects_label:"Subjects & Marks",
  individual_bucket_wellbeing_desc:"Stress and engagement signals",
  individual_bucket_wellbeing_label:"Wellbeing",
  setup_absent_alert_label:"Absent Alert",
  setup_btn_back:"Back",
  setup_btn_done_upload:"Done — Upload on Home",
  setup_btn_download_template:"Download Template",
  setup_btn_load_different:"Load a Different Sheet",
  setup_btn_load_existing:"Load Existing Filled Sheet",
  setup_btn_next:"Next",
  setup_card_new_desc:"Start fresh — set up institution, class, subjects and tests, then download a blank workbook to fill offline.",
  setup_card_new_title:"Create New Template",
  setup_card_update_desc:"Already filled Test 1? Load your workbook, add Test 2 / Test 3, then re-download — existing marks are kept, only new blank columns are added.",
  setup_card_update_title:"Update Existing Template",
  setup_class_name_error:"Class / Batch is required",
  setup_class_name_label:"Class / Batch",
  setup_class_name_placeholder:"e.g. Class 9",
  setup_class_section_label:"Section",
  setup_class_section_placeholder:"e.g. B",
  setup_class_teacher_label:"Teacher Name",
  setup_class_title:"Class / Batch",
  setup_class_year_error:"Academic year is required",
  setup_class_year_label:"Academic Year",
  setup_class_year_placeholder:"e.g. 2026",
  setup_compare_banner_btn:"Home · Upload",
  setup_compare_banner_desc:"Optional — if every section's teacher already has a filled sheet, skip straight to <button class=\"btn btn-secondary btn-sm\" data-action=\"goStep\" data-arg=\"home\" style=\"display:inline-flex;padding:3px 8px;font-size:12px;vertical-align:middle\">Home · Upload</button> and the Subjects/Tests/Max Marks from the first file you upload become the shared schema automatically. Only fill this in if you need to <b>generate a blank template</b> to hand out first — in that case, Subjects, Tests & Max Marks entered below will be shared across every section you compare.",
  setup_compare_banner_title:"Compare Sections / Batches — Institution mode",
  setup_drop_alert_label:"Drop Alert %",
  setup_howstart_title:"How would you like to start?",
  setup_indiv_multichild_hint:"Tracking more than one child? Just add another row in the downloaded template's STUDENTS sheet with a different Student ID — each child gets their own switcher entry on Insights, never compared to each other.",
  setup_inst_contact_label:"Contact",
  setup_inst_contact_placeholder:"phone / email",
  setup_inst_location_label:"Location",
  setup_inst_location_placeholder:"City, State",
  setup_inst_name_error:"Institution name is required",
  setup_inst_name_label:"Institution Name",
  setup_inst_name_placeholder:"e.g. Springfield International School",
  setup_inst_title:"Institution",
  setup_inst_type_label:"Type",
  setup_inst_type_select:"Select...",
  setup_merge_cancel:"Cancel — start a fresh template instead",
  setup_mode_indiv_desc:"A parent tracking one or more children, or an aspirant tracking their own prep — no class comparison, just personal progress over time.",
  setup_mode_indiv_title:"Individual (Parent / Self-Prep)",
  setup_mode_inst_desc:"A teacher or coaching centre tracking a whole class or batch of students — with rank, class average, and at-risk flags.",
  setup_mode_inst_title:"Institution / Coaching Batch",
  setup_pass_threshold_label:"Pass %",
  setup_scoring_grade:"Grade",
  setup_scoring_marks:"Marks",
  setup_scoring_passfail:"Pass/Fail",
  setup_scoring_pct:"Percentage",
  setup_scoring_title:"Scoring",
  setup_step1_title:"Step 1 · Setup",
  setup_subjects_addbtn:"Add Subject",
  setup_subjects_title:"Subjects",
  setup_subtitle:"Configure your institution, academic year, class, subjects and assessment details before importing student data.",
  setup_tests_addbtn:"Add Test",
  setup_tests_title:"Tests / Exams",
  setup_whofor_title:"Who is this for?",
  shell_home_left_pitch_1:"Instant PDF report cards",
  shell_home_left_pitch_2:"No data ever uploaded",
  shell_home_left_pitch_3:"Auto-detects subjects & tests",
  shell_home_left_pitch_4:"Works for one class or many",
  shell_home_left_pitch_5:"13 languages, full RTL support",
  shell_home_left_pitch_6:"Ask questions in plain language",
  shell_home_left_pitch_7:"Turns raw marks into rank, trend & risk flags",
  shell_home_right_pitch_1:"Class-wide KPIs — averages, pass rate, and trends across tests",
  shell_home_right_pitch_2:"A performance heatmap across every subject and test",
  shell_home_right_pitch_3:"An automatic list of students who may need extra help",
  shell_home_right_pitch_4:"Top performers and instant two-student comparisons",
  shell_home_right_pitch_5:"Patterns pulled out of teacher remarks and wellbeing notes",
  shell_home_right_pitch_6:"Performance groups, once the class is large enough",
  shell_hint_features_peek:"Tap for page info & help",
  shell_hint_properties_peek:"Tap for tools & actions",
  shell_left_file_details_title:"File details",
  shell_left_file_label:"Uploaded file",
  shell_left_multi_file:"Multiple files",
  shell_left_no_file:"No file uploaded yet",
  shell_left_org_label:"Institution / Individual",
  shell_left_records_label:"Records",
  shell_left_single_file:"Single file",
  shell_rail_features_title:"Features",
  shell_rail_properties_title:"Properties",
  shell_right_build_template:"Build Your Own Template",
  shell_right_exports_ready:"Exports ready",
  shell_right_link_sample_files:"Sample Files",
  shell_right_selected_features:"Selected features",
  shell_right_try_sample:"Try Sample Data",
  smart_search_ai_tooltip:"AI feature — development in progress",
  smart_search_back:"Back to Insights",
  smart_search_coming_soon:"Coming soon",
  smart_search_empty_sub:"This section needs a bit more data before questions become available here.",
  smart_search_empty_title:"Nothing to ask yet",
  smart_search_load_error:"Couldn't load Smart Search. Check your connection and try again.",
  smart_search_pro_notice:"Smart Search feature is coming in StudIn Pro.",
  smart_search_select_first:"Select a student first.",
  smart_search_select_student:"Select a student…",
  smart_search_student_label:"Student",
  smart_search_subtitle:"Tap a question for a plain-language answer, computed from this class's data. Nothing here is sent anywhere — calculated on your device, same as the rest of the app.",
  smart_search_title:"Smart Search",
  smart_v2_compare_link:"Compare two students",
  smart_v2_deflection_hint:"Try one of the suggestions below",
  smart_v2_input_placeholder:"Ask about this class or a student…",
  smart_v2_legacy_link:"Prefer tap-to-ask? Open Classic Smart Search",
  student_picker_prompt:"Type a student's name to see their full report.",
  subject_picker_prompt:"Pick a subject to see how the class did.",
  lang_ai_disclosure_notice:"These language translations were done using AI. If any words or sentences seem meaningless or incorrectly translated, please reach out to sandeep@hakki.in with details of the change needed, and we will get it corrected.",
};
// v3.9 — Phase 3 i18n. SR_STRINGS_EN above stays inline in this file as
// the EMERGENCY FALLBACK (per explicit direction: "English sits in html
// [/JS] only for any emergencies") — if i18n/en.json fails to fetch (bad
// connection, file missing, whatever), the app still runs correctly in
// English using this inline copy, never a blank/broken string.
// Hindi/Kannada (and any future language) are no longer hardcoded here —
// they load on demand from i18n/<code>.json only when the user actually
// picks that language (see loadLanguage() below), protecting low-end/
// slow-connection devices from downloading language data nobody asked
// for. This replaces the old SR_STRINGS_HI/SR_STRINGS_KN consts and the
// static SR_LANG_TABLES object that used to live here.
window.I18N_TABLES = { en: SR_STRINGS_EN };
window.SR_LANG = "en"; // default — see COUNTRY_LANGUAGES/applyCountryDefault() in js/state-nav.js for how India+English became the default

// FIX (i18n full sweep §5): toLocaleDateString() calls throughout the app
// used to run with no locale argument, so dates always rendered in the
// browser's SYSTEM locale — completely independent of which language the
// user picked in-app. A user with English OS settings but Hindi selected
// in Student Insight got an English-formatted date on their Hindi PDF
// report. bcp47TagFor() maps our 2-letter SR_LANG codes to real BCP-47
// tags so toLocaleDateString(bcp47TagFor(SR_LANG)) actually follows the
// in-app language choice.
const SR_LANG_BCP47 = {
  en:"en-IN", hi:"hi-IN", bn:"bn-IN", ta:"ta-IN", te:"te-IN", kn:"kn-IN",
  ml:"ml-IN", mr:"mr-IN", gu:"gu-IN", pa:"pa-IN", or:"or-IN", as:"as-IN",
  ur:"ur-IN",
};
function bcp47TagFor(langCode){
  return SR_LANG_BCP47[langCode] || "en-IN";
}
window.I18N_LOADING = false;

function loadLanguage(code){
  // BUG FIX (vs-shell-plan-v2 Task 1): English used to short-circuit here
  // ("already... it's English, always present inline") and never fetch
  // i18n/en.json, while SR_STRINGS_EN above was a hand-maintained subset
  // that had silently drifted out of sync with en.json (missing keys like
  // smart_search_back/title/subtitle) — that drift, not a race condition,
  // is why raw key names showed on screen. English now goes through the
  // exact same fetch path as every other language: one code path for all
  // 14 cases. SR_STRINGS_EN stays inline purely as the emergency fallback
  // (per the original "English sits in html/JS only for emergencies"
  // direction, see comment above) — it's still used below if the fetch
  // fails, and it still pre-populates I18N_TABLES.en so the very first
  // synchronous render (before this fetch resolves) isn't blank.
  if(window.I18N_TABLES[code] && code!=="en"){ // already fetched (non-English only — English always refetches once, below)
    window.SR_LANG = code;
    reapplyI18nStrings();
    return Promise.resolve();
  }
  window.I18N_LOADING = true;
  return fetch(`i18n/${code}.json`)
    .then(r=>{ if(!r.ok) throw new Error("i18n fetch failed ("+r.status+")"); return r.json(); })
    .then(json=>{
      window.I18N_TABLES[code] = json;
      window.SR_LANG = code;
      window.I18N_LOADING = false;
      reapplyI18nStrings();
    })
    .catch(err=>{
      window.I18N_LOADING = false;
      console.error("loadLanguage failed for", code, err);
      if(code==="en"){
        // Emergency fallback: keep the inline SR_STRINGS_EN copy already
        // sitting in window.I18N_TABLES.en so English still renders correctly
        // even though i18n/en.json couldn't be fetched.
        window.SR_LANG = "en";
        reapplyI18nStrings();
        return;
      }
      toast("Couldn't load that language — staying on "+(SR_LANG_TABLES_LABEL(window.SR_LANG))+".","warn");
    });
}
// AI-translation disclosure popup — shown whenever the user switches from
// India/English into any regional language (see onLanguageChange in
// js/state-nav.js). Displays the fixed disclosure message in both English
// and the newly selected language so non-English readers can still verify
// the sender/purpose in a language they're confident in. Reuses the
// existing generic #modal-overlay/#modal-box, same as Sample Files and
// Student Detail modals elsewhere in the app.
function showAiTranslationNotice(langCode){
  const enTable = window.I18N_TABLES.en || SR_STRINGS_EN;
  const nativeTable = window.I18N_TABLES[langCode] || {};
  const enText = enTable["lang_ai_disclosure_notice"] || "";
  const nativeText = nativeTable["lang_ai_disclosure_notice"] || "";
  const nativeLabel = (nativeTable._meta && nativeTable._meta.label) || langCode;
  $("#modal-content").html(`
    <h3 style="font-family:var(--font-display);font-size:16px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
      <svg class='ic' width='1em' height='1em' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true' focusable='false'><path d='M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'/><path d='M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'/></svg>
      AI Translation Notice
    </h3>
    <div style="font-size:13px;color:var(--c-text2);line-height:1.5;margin-bottom:12px">${enText}</div>
    <div style="font-size:13px;color:var(--c-text2);line-height:1.5;padding-top:12px;border-top:1px solid var(--c-border)" lang="${langCode}">${nativeText}</div>
    <div style="font-size:10px;color:var(--c-text3);margin-top:10px;text-transform:uppercase;letter-spacing:.4px">${nativeLabel}</div>
  `);
  $("#modal-overlay").addClass("open");
  setTimeout(()=>{const f=document.querySelector('#modal-overlay.open .modal-close');if(f)f.focus();},0);
}
function SR_LANG_TABLES_LABEL(code){
  const t = window.I18N_TABLES[code];
  return (t&&t._meta&&t._meta.label) || code;
}
// BUG 1 FIX (studin-ui-bugs-prompt v1.0): a global data-i18n sweep did NOT
// exist before this — reapplyI18nStrings() only ever re-rendered the
// bucket/Smart Search screens via JS (srT() calls inside their own render
// functions). This adds the missing static-HTML half: any element with a
// data-i18n="<key>" attribute anywhere in the document gets its innerHTML
// replaced from the current language table. Uses .html() not .text()
// because some tagged elements (e.g. about_hero_title) contain nested
// markup (a colored <span>) that must be preserved — these are trusted,
// app-authored translation strings, not user input, so this is the same
// trust model already used for srT()-driven bucket/Smart Search content
// elsewhere in the app, not a new XSS surface.
function applyDataI18nSweep(){
  const table = window.I18N_TABLES[window.SR_LANG] || SR_STRINGS_EN;
  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    const val = table[key] || SR_STRINGS_EN[key];
    if(val!==undefined) el.innerHTML = val;
  });
  // v3.9: placeholder text on inputs can't be set via innerHTML — needs its
  // own attribute + pass.
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
    const key = el.getAttribute("data-i18n-placeholder");
    const val = table[key] || SR_STRINGS_EN[key];
    if(val!==undefined) el.setAttribute("placeholder",val);
  });
  // i18n-gap-analysis: loader previously had no handling for title= or
  // aria-label= attributes at all — every data-i18n-title/data-i18n-aria-label
  // in the HTML was inert until these two passes were added.
  document.querySelectorAll("[data-i18n-title]").forEach(el=>{
    const key = el.getAttribute("data-i18n-title");
    const val = table[key] || SR_STRINGS_EN[key];
    if(val!==undefined) el.setAttribute("title",val);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el=>{
    const key = el.getAttribute("data-i18n-aria-label");
    const val = table[key] || SR_STRINGS_EN[key];
    if(val!==undefined) el.setAttribute("aria-label",val);
  });
  // i18n-gap-analysis #80: <title> is outside the querySelectorAll sweep
  // (it's not swept by "[data-i18n]") — set it explicitly instead.
  const titleVal = table["doc_title"] || SR_STRINGS_EN["doc_title"];
  if(titleVal!==undefined) document.title = titleVal;
}
// v3.9 — small helper so the handful of buttons that get their innerHTML
// rewritten from JS (Download Template / Load Existing / Load a Different
// Sheet — see project-setup.js and template-upload.js) look up the current
// language instead of hardcoding English every time they re-render.
function i18nLabel(key, fallback){
  const table = window.I18N_TABLES[window.SR_LANG] || SR_STRINGS_EN;
  return table[key] || SR_STRINGS_EN[key] || fallback;
}
// Re-render whichever screen is currently visible so a language switch
// takes effect immediately without a full page reload. Scoped to the
// screens that actually use srT() today (buckets, Smart Search) — see
// TRANSLATION_REFERENCE.md for the current scope limitation (most of the
// app outside these ~40 keys is still hardcoded English).
function reapplyI18nStrings(){
  applyDataI18nSweep();
  // RTL support: only Urdu (ur.json) is flagged rtl:true in its _meta
  // today. This flips the DIRECTION of the screens that actually
  // localize (buckets, Smart Search, AI feature panel — v4.2 adds the
  // latter) — NOT the whole page, since the rest of the app (Setup, FAQ,
  // Export, etc.) is still English-only layout and flipping it would look
  // broken, not better. A real full-page RTL pass is separate future
  // work — this is a scoped, honest fix for the screens that currently
  // show translated text at all.
  const table = window.I18N_TABLES[window.SR_LANG];
  const isRtl = !!(table && table._meta && table._meta.rtl);
  $("#bucket-screen,#bucket-list-screen,#bucket-answer-screen,#smart-search-screen,#panel-ai")
    .attr("dir", isRtl ? "rtl" : "ltr")
    .toggleClass("rtl-screen", isRtl);
  // vs-shell-plan-v2 Task 3: #app-shell-body gets dir only (no .rtl-screen
  // class, which sets text-align:right) so the shell grid's own columns
  // mirror without forcing text-align on the still-English-layout panels
  // nested inside it. A full content-level RTL audit is Task 8's job.
  $("#app-shell-body").attr("dir", isRtl ? "rtl" : "ltr");
  // v4.21-individual-mode-shell-parity §6/OQ2: this used to check
  // #bucket-screen's visibility, which was already stale for Institution
  // mode (migrated to the rail-driven #bucket-answer-screen/
  // #legacy-dashboard-body pattern earlier — #bucket-screen is never
  // shown for it) and is now stale for Individual mode too after this
  // migration. Re-render whichever mode's actual current view is showing.
  if(APP.compareMode){
    if($("#legacy-dashboard-body").is(":visible") && typeof renderDashboard==="function") renderDashboard();
    else if($("#bucket-answer-screen").is(":visible") && typeof renderCompareOverview==="function") renderCompareOverview();
  } else if(APP.setup && APP.setup.mode==="individual"){
    if($("#bucket-answer-screen").is(":visible") && typeof openIndividualBucket==="function") openIndividualBucket(window._individualBucketCurrent||"report");
  } else {
    if(($("#legacy-dashboard-body").is(":visible")||$("#bucket-answer-screen").is(":visible")) && typeof openBucket==="function") openBucket(APP._currentBucketId||"class");
  }
  if($("#smart-search-screen").is(":visible") && typeof renderSmartSearchScreen==="function"){
    renderSmartSearchScreen();
  }
  // v4.2: AI feature checkboxes are JS-injected innerHTML (data-driven from
  // AI_FEATURES), not static data-i18n markup, so the sweep above can't
  // reach them — re-render explicitly, same pattern as buckets/Smart
  // Search above, only when that panel is actually on screen.
  if($("#panel-ai").is(":visible") && typeof renderAICheckboxes==="function"){
    renderAICheckboxes();
  }
  // vs-shell-plan-v2 Task 4/5: left-rail and right-rail content are
  // JS-injected innerHTML too (same reason as the AI checkboxes above) —
  // the data-i18n sweep can't reach them, re-render explicitly for
  // whichever panel is current. Wrapped: see goStep()'s identical guard
  // in js/state-nav.js for why.
  try{
    if(typeof renderShellLeftRail==="function" && APP.currentStep){
      renderShellLeftRail(APP.currentStep);
    }
    if(typeof renderShellRightRail==="function" && APP.currentStep){
      renderShellRightRail(APP.currentStep);
    }
  }catch(err){
    console.error("Shell rail refresh failed on language switch:",err);
  }
}
function srT(key,params,count){
  const table = window.I18N_TABLES[window.SR_LANG] || SR_STRINGS_EN;
  let k=key;
  if(count!==undefined&&(table[key+"_one"]||table[key+"_other"]))k=(count===1)?key+"_one":key+"_other";
  let s=table[k]||SR_STRINGS_EN[k]||key;
  if(params)Object.keys(params).forEach(p=>{s=s.split("{{"+p+"}}").join(params[p]);});
  return s;
}

// Findings that mean "this child may need attention" — Data Error is
// deliberately excluded: it's a data-quality problem surfaced via the
// EXPORT_GATE banner, not a performance finding, and listing it here
// would misleadingly read as "this student is struggling."


// --- ES module exports (added for module-system conversion, HANDOVER #4) ---
export { SR_LANG_TABLES_LABEL, SR_STRINGS_EN, _ordinal, _pluralizeUnit, applyDataI18nSweep, bcp47TagFor, continuityNarrativeClause, generateHomePlan, generateParentMessage, generateSchoolPlan, generateTrendFacts, generateWhatChangedSummary, i18nLabel, loadLanguage, reapplyI18nStrings, renderDataIssueBanner, shareInsightAsImage, showAiTranslationNotice, srT, weakestSubjectsInfo, wrapCanvasText };

// Legacy-global compatibility shim: modules don't leak top-level
// declarations onto window the way classic scripts did. The handful of
// inline onkeydown=/oninput=/onchange= attributes intentionally left as-is
// (out of scope for HANDOVER #3 — only onclick was converted) still need a
// bare global to resolve, so every exported name is also mirrored onto
// window here. Harmless duplication for anything already imported properly.
if(typeof window!=='undefined'){window.SR_LANG_TABLES_LABEL=SR_LANG_TABLES_LABEL;window.SR_STRINGS_EN=SR_STRINGS_EN;window._ordinal=_ordinal;window._pluralizeUnit=_pluralizeUnit;window.applyDataI18nSweep=applyDataI18nSweep;window.bcp47TagFor=bcp47TagFor;window.continuityNarrativeClause=continuityNarrativeClause;window.generateHomePlan=generateHomePlan;window.generateParentMessage=generateParentMessage;window.generateSchoolPlan=generateSchoolPlan;window.generateTrendFacts=generateTrendFacts;window.generateWhatChangedSummary=generateWhatChangedSummary;window.i18nLabel=i18nLabel;window.loadLanguage=loadLanguage;window.reapplyI18nStrings=reapplyI18nStrings;window.renderDataIssueBanner=renderDataIssueBanner;window.shareInsightAsImage=shareInsightAsImage;window.showAiTranslationNotice=showAiTranslationNotice;window.srT=srT;window.weakestSubjectsInfo=weakestSubjectsInfo;window.wrapCanvasText=wrapCanvasText;}
