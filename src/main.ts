import "./style.css";
import mark from "./mark.svg";
import example from "../fixtures/meeting.txt?raw";
import { icon } from "./icons";
import { esc, isMinutes, lengthOf, markdown, renderMinutes } from "./result";
import type { Minutes } from "./result";

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const key = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
const now = new Date();
const date = [now.getFullYear(), String(now.getMonth()+1).padStart(2,"0"), String(now.getDate()).padStart(2,"0")].join(" / ");
byId("app").innerHTML = `
<header class="topbar"><div class="topbar-inner">
  <div class="brand"><img src="${mark}" width="37" height="37" alt=""><strong>墨记</strong><span class="brand-en" lang="en">Minute Desk</span></div>
  <button id="help" class="quiet help-btn">${icon("book")}使用说明</button>
</div></header>
<main>
  <div class="intro"><div><h1>AI 会议纪要整理器</h1><p>从会议原文中提取决定与待办，逐条核对讨论结论。</p></div>
  <div class="date">${icon("calendar")}<time>${date}</time></div></div>
  <div class="workspace">
    <section class="panel input-panel" aria-labelledby="source-title">
      <div class="panel-head"><div class="title-lock"><span class="title-icon">${icon("transcript")}</span><h2 id="source-title">原始纪要</h2></div></div>
      <div class="input-body">
        <div class="tools"><button id="sample" class="light">${icon("insert")}填入示例纪要</button><button id="clear" class="quiet clear-btn">${icon("erase")}清空</button></div>
        <div class="editor"><textarea id="source" aria-labelledby="source-title" placeholder="在此粘贴会议记录或对话原文…" spellcheck="false"></textarea><div class="meter" id="meter"><span id="count">0</span> 字<span id="limit-warning"></span></div></div>
      </div>
      <div class="panel-foot input-foot"><button id="submit" class="primary" aria-keyshortcuts="Meta+Enter Control+Enter">${icon("organize")}<span id="submit-label">AI 整理</span><kbd class="on-button">${key} ↵</kbd></button></div>
    </section>
    <section class="panel result-panel" aria-labelledby="review-title" id="review">
      <div class="panel-head"><div class="title-lock"><span class="title-icon">${icon("layout")}</span><h2 id="review-title">整理结果</h2></div>
      <label class="switch-label"><input type="checkbox" role="switch" id="evidence"><span class="switch"></span>显示原文依据</label></div>
      <div id="result"></div>
      <div class="panel-foot result-foot"><span id="result-status" class="result-status"></span><button id="copy" class="light" disabled>${icon("copy")}复制整理结果</button></div>
    </section>
  </div>
  <div class="privacy">${icon("lock")}原文仅在点击整理时发送至模型服务。</div>
</main>
<div role="status" aria-live="polite" id="announcement" class="sr-only"></div>
<dialog id="guide" aria-labelledby="guide-title"><div class="dialog-head"><h2 id="guide-title">使用说明</h2><button id="close" class="close-btn" aria-label="关闭说明">${icon("close")}</button></div>
  <ol><li>粘贴会议记录，或点击「填入示例纪要」试用。</li><li>点击「AI 整理」提取摘要、决定、待办和待确认问题。也可按 <kbd>${key} + Enter</kbd> 提交。</li><li>打开「显示原文依据」检查每条结论。复制时会保留当前显示的依据。</li></ol>
  <p>原文会发送至配置的模型服务。刷新或关闭此页面后，当前原文和结果将清空。</p></dialog>
<dialog id="copy-dialog" aria-labelledby="copy-title"><div class="dialog-head"><h2 id="copy-title">手动复制结果</h2><button id="close-copy" class="close-btn" aria-label="关闭复制窗口">${icon("close")}</button></div><p>浏览器限制了剪贴板权限。可在下方选中内容后复制。</p><textarea id="copy-text" readonly aria-label="可复制的 Markdown 结果"></textarea></dialog>`;

const input = byId<HTMLTextAreaElement>("source");
const submit = byId<HTMLButtonElement>("submit");
const sample = byId<HTMLButtonElement>("sample");
const clear = byId<HTMLButtonElement>("clear");
const copy = byId<HTMLButtonElement>("copy");
const evidence = byId<HTMLInputElement>("evidence");
const result = byId("result");
const guide = byId<HTMLDialogElement>("guide");
const copyDialog = byId<HTMLDialogElement>("copy-dialog");
let minutes: Minutes | null = null;
let busy = false;
let failure = "";
let copiedTimer: number | undefined;
const emptyState = `
<div class="empty-state">
  <div class="paper-art" aria-hidden="true"><div class="dot-field"></div><div class="back-paper"></div><div class="front-paper"><i class="paper-bookmark"></i><div class="paper-rubric"></div><div class="paper-rule long"></div><div class="paper-rule"></div><div class="paper-rule short"></div><div class="paper-tasks"><i></i><b></b></div></div><span class="seal">${icon("check")}</span></div>
  <h3>等待整理会议纪要</h3><p>在原始纪要中填入内容，点击「AI 整理」即可生成</p>
  <div class="module-key"><span>${icon("summary")}会议摘要</span><span>${icon("decision")}已确认的决定</span><span>${icon("task")}待办事项</span><span>${icon("question")}待确认问题</span></div>
</div>`;

const inputLimit = 20_000;
function updateCount() {
  const chars = lengthOf(input.value);
  const over = chars > inputLimit;
  byId("count").textContent = chars.toLocaleString("zh-CN");
  byId("limit-warning").textContent = over ? " · 超出 20,000 字上限" : "";
  byId("meter").classList.toggle("over-limit", over);
  input.setAttribute("aria-invalid", String(over));
  input.setAttribute("aria-describedby", "meter");
  submit.disabled = busy || !input.value.trim() || over;
  return chars;
}
function paint() {
  const chars = updateCount();
  sample.disabled = busy;
  clear.disabled = busy || !chars;
  input.readOnly = busy;
  byId("submit-label").textContent = busy ? "整理中…" : "AI 整理";
  evidence.disabled = !minutes;
  copy.disabled = !minutes;
  clearTimeout(copiedTimer);
  copy.innerHTML = icon("copy") + "复制整理结果";
  result.setAttribute("aria-busy", String(busy));
  const status = byId("result-status");
  status.textContent = minutes ? "已生成" : busy ? "整理中" : failure ? "整理失败" : "等待输入";
  status.dataset.active = String(!!minutes || busy);
  if (busy) {
    result.innerHTML = `<div class="loading"><div class="loading-heading"><i class="spinner"></i><span>正在逐句核对决策与待办…</span></div><div class="skeleton"><i></i><i></i><i></i></div><div class="skeleton"><i></i><i></i><i></i></div></div>`;
  } else if (failure) {
    result.innerHTML = `<div class="error-state"><div class="error-mark">${icon("alert")}</div><h3>整理未完成</h3><p>${esc(failure)}</p><button class="light" id="retry">${icon("retry")}重试</button></div>`;
    byId("retry").onclick = organize;
  } else result.innerHTML = minutes ? renderMinutes(minutes, evidence.checked) : emptyState;
}

function announce(s: string) { byId("announcement").textContent = s; }
function changed() {
  if (minutes || failure) { minutes = null; failure = ""; paint(); }
  else {
    updateCount();
    clear.disabled = !input.value;
  }
  byId("result-status").textContent = input.value.trim() ? "等待整理" : "等待输入";
}
input.oninput = changed;
sample.onclick = () => { input.value = example.trim(); changed(); input.focus(); input.scrollTop = 0; announce("已填入示例纪要"); };
clear.onclick = () => { input.value = ""; changed(); input.focus(); announce("已清空"); };
submit.onclick = organize;
evidence.onchange = paint;
byId("help").onclick = () => guide.showModal();
byId("close").onclick = () => guide.close();
byId("close-copy").onclick = () => copyDialog.close();
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.isComposing && !e.repeat && !document.querySelector("dialog[open]")) {
    e.preventDefault(); void organize();
  }
});

async function organize() {
  if (busy || !input.value.trim() || lengthOf(input.value) > inputLimit) return;
  busy = true; failure = ""; minutes = null;
  paint(); announce("正在逐句核对决策与待办");
  if (matchMedia("(max-width: 800px)").matches) byId("review").scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 125_000);
  try {
    const response = await fetch("/api/organize", { method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({text: input.value}), cache: "no-store", signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (typeof data?.error?.message === "string") throw new Error(data.error.message);
      if ([408, 504].includes(response.status)) throw new Error("模型响应超时。请缩短会议记录后重试。");
      throw new Error(`整理服务暂时不可用（HTTP ${response.status}），请稍后重试。`);
    }
    if (!isMinutes(data)) throw new Error("收到的结果格式不完整，请重试以重新整理。");
    minutes = data;
    announce("整理已完成，可打开原文依据逐条核对。");
  } catch (err) {
    failure = controller.signal.aborted ? "模型响应超时，请稍后重试。" : err instanceof TypeError ? "网络连接失败，请检查网络或确认本地服务已启动，再点击重试。" : err instanceof Error ? err.message : "整理失败，请重试。";
    announce(failure);
  } finally { window.clearTimeout(timer); busy = false; paint(); }
}

copy.onclick = async () => {
  if (!minutes) return;
  const original = minutes;
  const text = markdown(original, evidence.checked);
  try {
    await navigator.clipboard.writeText(text);
    if (minutes !== original) return;
    copy.innerHTML = icon("check") + "已复制";
    announce("已复制整理结果"); clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => { copy.innerHTML = icon("copy") + "复制整理结果"; }, 2200);
  } catch {
    if (minutes !== original) return;
    const area = byId<HTMLTextAreaElement>("copy-text");
    area.value = text; copyDialog.showModal(); area.focus(); area.select();
  }
};
paint();
