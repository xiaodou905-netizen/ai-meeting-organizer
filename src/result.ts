import { icon } from "./icons";
import type { IconName } from "./icons";

export interface Minutes {
  summary: string;
  confirmed_decisions: {item: string; evidence: string}[];
  action_items: {task: string; owner: string; deadline: string; note: string; evidence: string}[];
  open_questions: {question: string; owner_or_party: string; evidence: string}[];
}

export const lengthOf = (s: string) => Array.from(s).length;
export const esc = (s: string) => s.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function isMinutes(raw: unknown): raw is Minutes {
  if (typeof raw !== "object" || !raw) return false;
  const obj = raw as Record<string, unknown>;
  const rows = (v: unknown, fields: string[]) => Array.isArray(v) && v.every(r => r && fields.every(f => typeof r[f] === "string"));
  return typeof obj.summary === "string" && lengthOf(obj.summary) <= 150 &&
    rows(obj.confirmed_decisions, ["item", "evidence"]) &&
    rows(obj.action_items, ["task", "owner", "deadline", "note", "evidence"]) &&
    rows(obj.open_questions, ["question", "owner_or_party", "evidence"]);
}

function field(s: string) {
  return s === "待确认" ? '<span class="pending">待确认</span>' : esc(s || "—");
}

export function renderMinutes(m: Minutes, showEvidence: boolean) {
  const quote = (s: string) => showEvidence ? `<blockquote><span class="sr-only">原文依据：</span>${esc(s)}</blockquote>` : "";
  const heading = (type: IconName, name: string, meta: string) => `<div class="section-title">${icon(type)}<h3>${name}</h3><span class="section-meta">${meta}</span></div>`;
  const empty = (s: string) => `<p class="no-items">${s}</p>`;
  return `<div class="minutes">
    <section>${heading("summary", "会议摘要", lengthOf(m.summary) + " / 150 字")}<p class="summary-body">${esc(m.summary)}</p></section>
    <section>${heading("decision", "已确认的决定", m.confirmed_decisions.length + " 项")}
      ${m.confirmed_decisions.length ? '<ul class="decisions">' + m.confirmed_decisions.map(d => `<li><div class="decision-line">${icon("check")}<span>${esc(d.item)}</span></div>${quote(d.evidence)}</li>`).join("") + "</ul>" : empty("原文中没有明确拍板的事项。")}
    </section>
    <section>${heading("task", "待办事项", m.action_items.length + " 项")}
      ${m.action_items.length ? `<table><caption class="sr-only">待办事项及分工</caption><colgroup><col class="col-task"><col class="col-owner"><col class="col-date"><col></colgroup><thead><tr>${["事项","负责人","截止日期","备注"].map(t=>`<th scope="col">${t}</th>`).join("")}</tr></thead>${m.action_items.map(a => `<tbody><tr><td data-label="事项">${field(a.task)}</td><td data-label="负责人">${field(a.owner)}</td><td data-label="截止日期">${field(a.deadline)}</td><td data-label="备注">${field(a.note)}</td></tr>${showEvidence ? `<tr class="evidence-row"><td colspan="4">${quote(a.evidence)}</td></tr>` : ""}</tbody>`).join("")}</table>` : empty("原文中没有明确要推进的任务。")}
    </section>
    <section>${heading("question", "待确认问题", m.open_questions.length + " 项")}
      ${m.open_questions.length ? '<ul class="questions">' + m.open_questions.map(q=>`<li><div>${esc(q.question)}</div><div class="party">待谁确认 <span>${field(q.owner_or_party)}</span></div>${quote(q.evidence)}</li>`).join("") + "</ul>" : empty("没有提取到待确认的问题。")}
    </section></div>`;
}

export function markdown(m: Minutes, evidence: boolean) {
  const lines = ["# 会议纪要", "", "## 会议摘要", "", m.summary];
  const cite = (s: string) => { if (evidence) lines.push("", "> 原文依据：" + s.replace(/\n/g,"\n> "), ""); };
  lines.push("", "## 已确认的决定", "");
  if (!m.confirmed_decisions.length) lines.push("无。");
  for (const d of m.confirmed_decisions) { lines.push("- " + d.item); cite(d.evidence); }
  lines.push("", "## 待办事项", "");
  if (!m.action_items.length) lines.push("无。");
  for (const a of m.action_items) {
    lines.push("- " + a.task, "  - 负责人：" + a.owner, "  - 截止日期：" + a.deadline);
    if (a.note) lines.push("  - 备注：" + a.note);
    cite(a.evidence);
  }
  lines.push("", "## 待确认问题", "");
  if (!m.open_questions.length) lines.push("无。");
  for (const q of m.open_questions) { lines.push("- " + q.question, "  - 待谁确认：" + q.owner_or_party); cite(q.evidence); }
  return lines.join("\n").trim() + "\n";
}
