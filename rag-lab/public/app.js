const messages = document.querySelector("#messages");
const sources = document.querySelector("#sources");
const composer = document.querySelector("#composer");
const questionInput = document.querySelector("#question");
const modelPill = document.querySelector("#model-pill");
const audienceFilter = document.querySelector("#audience-filter");
const categoryFilter = document.querySelector("#category-filter");
const tagFilter = document.querySelector("#tag-filter");
const docsModal = document.querySelector("#docs-modal");
const modalEyebrow = document.querySelector("#modal-eyebrow");
const modalTitle = document.querySelector("#modal-title");
const modalBody = document.querySelector("#modal-body");
const tabs = document.querySelectorAll("[data-tab]");
const retrievalTitle = document.querySelector("#retrieval-title");
const sourcesPanel = document.querySelector("#sources-panel");
const debugPanel = document.querySelector("#debug-panel");
const debugLog = document.querySelector("#debug-log");

let allDocs = [];
let debugEvents = [];
let modalBackView = null;
let conversationHistory = [];

const storageKeys = {
  tab: "rag-lab:selected-tab",
  audience: "rag-lab:audience-filter",
  category: "rag-lab:category-filter",
  tag: "rag-lab:tag-filter"
};

function option(value) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = value;
  return element;
}

function filters() {
  return {
    audience: audienceFilter.value || "patients",
    category: categoryFilter.value,
    tag: tagFilter.value
  };
}

function persistFilters() {
  localStorage.setItem(storageKeys.audience, audienceFilter.value);
  localStorage.setItem(storageKeys.category, categoryFilter.value);
  localStorage.setItem(storageKeys.tag, tagFilter.value);
}

function restoreSelect(select, key, fallback = "") {
  const stored = localStorage.getItem(key);
  const value = stored ?? fallback;
  if ([...select.options].some((item) => item.value === value)) {
    select.value = value;
  } else {
    select.value = fallback;
  }
}

function addMessage(role, text) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const paragraph = document.createElement("p");
  if (role === "assistant") {
    paragraph.innerHTML = renderMarkdown(text);
  } else {
    paragraph.textContent = text;
  }
  article.append(paragraph);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
  return article;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderInlineMarkdown(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderMarkdown(text) {
  const blocks = [];
  let listItems = [];

  function flushList() {
    if (!listItems.length) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    listItems = [];
  }

  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*-\s+(.+)$/);
    if (bullet) {
      listItems.push(renderInlineMarkdown(bullet[1]));
      continue;
    }

    flushList();
    if (line.trim()) {
      blocks.push(`<span>${renderInlineMarkdown(line)}</span>`);
    } else {
      blocks.push("<br />");
    }
  }

  flushList();
  return blocks.join("");
}

function formatScore(score) {
  return Math.round(score * 1000) / 1000;
}

function timestamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function addDebugEvent(title, detail = {}) {
  debugEvents.push({
    at: timestamp(),
    title,
    detail,
    summary: summarizeDebugEvent(title, detail)
  });
  renderDebug();
}

function summarizeDebugEvent(title, detail) {
  if (title === "User submitted message") {
    return `Question: ${detail.question}`;
  }

  if (title === "Prepared conversation history") {
    return `${detail.turns_sent} recent turn${detail.turns_sent === 1 ? "" : "s"} sent for context.`;
  }

  if (title === "Collected metadata filters") {
    const active = Object.entries(detail)
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}: ${value}`);
    return active.length ? active.join(" · ") : "No metadata filters selected.";
  }

  if (title === "Sending /api/chat request") {
    return `${detail.method} ${detail.endpoint}`;
  }

  if (title === "Received /api/chat response") {
    return `${detail.source_count} sources · ${detail.answer_character_count} answer chars · ${detail.round_trip_ms}ms round trip`;
  }

  if (title === "Query rewrite") {
    if (detail.skipped) return `Skipped: ${detail.reason}`;
    return `"${detail.original_question}" → "${detail.rewritten_query}" · ${detail.rewrite_ms}ms`;
  }

  if (title === "Server retrieval and generation trace") {
    const retrieval = detail.retrieval || {};
    return [
      `${detail.total_ms}ms total`,
      `${detail.generation_ms}ms generation`,
      `${retrieval.documents_after_filters} candidates`,
      `${retrieval.requested_limit} docs selected`
    ].join(" · ");
  }

  if (title === "Final LLM input") {
    const summary = detail.summary || {};
    return [
      `${summary.history_turns} history turn${summary.history_turns === 1 ? "" : "s"}`,
      `${summary.retrieved_documents?.length || 0} retrieved docs`,
      `${summary.context_character_count || 0} context chars`
    ].join(" · ");
  }

  if (title === "Rendered answer and source cards") {
    return detail.rendered_sources.map((source) => source.title).join(" · ");
  }

  if (title === "Request failed") {
    return detail.message;
  }

  return "Open details for the full payload.";
}

function highlightJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2)).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let className = "json-number";
      if (/^"/.test(match)) {
        className = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/true|false/.test(match)) {
        className = "json-boolean";
      } else if (/null/.test(match)) {
        className = "json-null";
      }
      return `<span class="${className}">${match}</span>`;
    }
  );
}

function renderDebug() {
  debugLog.innerHTML = "";

  if (!debugEvents.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Ask a question to see the request, retrieval, and generation trace.";
    debugLog.append(empty);
    return;
  }

  for (const event of debugEvents) {
    const item = document.createElement("article");
    item.className = "debug-event";

    const header = document.createElement("div");
    header.className = "debug-event-header";
    header.innerHTML = `
      <div>
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(event.summary)}</p>
      </div>
      <span>${escapeHtml(event.at)}</span>
    `;

    const viewJson = document.createElement("button");
    viewJson.className = "debug-json-link";
    viewJson.type = "button";
    viewJson.textContent = "View JSON";
    viewJson.addEventListener("click", () => showJsonDetail(event));

    item.append(header, viewJson);
    debugLog.append(item);
  }
}

function showJsonDetail(event) {
  modalBackView = null;
  modalEyebrow.textContent = "Debug JSON";
  modalTitle.textContent = event.title;
  modalBody.innerHTML = "";

  const detail = document.createElement("article");
  detail.className = "json-detail";
  detail.innerHTML = `
    <p>${escapeHtml(event.summary)}</p>
    <pre><code>${highlightJson(event.detail)}</code></pre>
  `;

  modalBody.append(detail);
  openModal();
}

function truncate(text, length = 220) {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function createDocCard(doc, options = {}) {
  const { showScores = false, detailBackView = null } = options;
  const article = document.createElement("article");
  article.className = "source";
  article.tabIndex = 0;
  article.setAttribute("role", "button");
  article.setAttribute("aria-label", `Open ${doc.title}`);

  const title = document.createElement("h3");
  title.textContent = doc.title;
  article.append(title);

  if (showScores) {
    const scores = document.createElement("div");
    scores.className = "scores";
    scores.innerHTML = `
      <span>hybrid ${formatScore(doc.score)}</span>
      <span>vector ${formatScore(doc.vector_score)}</span>
      <span>keyword ${formatScore(doc.keyword_score)}</span>
    `;
    article.append(scores);
  }

  const meta = document.createElement("p");
  meta.textContent = `${doc.category} · ${doc.audience}`;
  article.append(meta);

  const preview = document.createElement("p");
  preview.textContent = truncate(doc.text);
  article.append(preview);

  article.addEventListener("click", () => showDocDetail(doc, detailBackView));
  article.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showDocDetail(doc, detailBackView);
    }
  });

  return article;
}

function renderSources(results) {
  sources.innerHTML = "";

  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No matching sources found.";
    sources.append(empty);
    return;
  }

  for (const result of results) {
    sources.append(createDocCard(result, { showScores: true }));
  }
}

function setActiveTab(name) {
  const nextTab = name === "debug" ? "debug" : "sources";
  localStorage.setItem(storageKeys.tab, nextTab);

  for (const tab of tabs) {
    const isActive = tab.dataset.tab === nextTab;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }

  sourcesPanel.hidden = nextTab !== "sources";
  debugPanel.hidden = nextTab !== "debug";
  sourcesPanel.classList.toggle("is-active", nextTab === "sources");
  debugPanel.classList.toggle("is-active", nextTab === "debug");
  retrievalTitle.textContent = nextTab === "debug" ? "Debug" : "Sources";
}

function openModal() {
  docsModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal() {
  docsModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function showAllDocs() {
  modalBackView = null;
  modalEyebrow.textContent = "Knowledge Base";
  modalTitle.textContent = `${allDocs.length} docs`;
  modalBody.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "doc-grid";
  for (const doc of allDocs) {
    grid.append(createDocCard(doc, { detailBackView: "all-docs" }));
  }

  modalBody.append(grid);
  openModal();
}

function showDocDetail(doc, backView = null) {
  modalBackView = backView;
  modalEyebrow.textContent = `${doc.category} · ${doc.audience}`;
  modalTitle.textContent = doc.title;
  modalBody.innerHTML = "";

  const detail = document.createElement("article");
  detail.className = "doc-detail";

  if (modalBackView) {
    const back = document.createElement("button");
    back.className = "back-button";
    back.type = "button";
    back.textContent = "Back to docs";
    back.addEventListener("click", () => {
      if (modalBackView === "all-docs") showAllDocs();
    });
    detail.append(back);
  }

  const meta = document.createElement("dl");
  meta.innerHTML = `
    <div><dt>ID</dt><dd>${escapeHtml(doc.id)}</dd></div>
    <div><dt>Source</dt><dd>${escapeHtml(doc.source_type)}</dd></div>
    <div><dt>Reviewed</dt><dd>${escapeHtml(doc.last_reviewed)}</dd></div>
    <div><dt>Tags</dt><dd>${escapeHtml(doc.tags.join(", "))}</dd></div>
  `;

  const text = document.createElement("p");
  text.textContent = doc.text;

  detail.append(meta, text);
  modalBody.append(detail);
  openModal();
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function loadMetadata() {
  const [metadataResponse, docsResponse] = await Promise.all([
    fetch("/api/metadata"),
    fetch("/api/docs")
  ]);
  const metadata = await metadataResponse.json();
  const docsPayload = await docsResponse.json();
  allDocs = docsPayload.docs;

  for (const audience of metadata.audiences) audienceFilter.append(option(audience));
  for (const category of metadata.categories) categoryFilter.append(option(category));
  for (const tag of metadata.tags) tagFilter.append(option(tag));

  restoreSelect(audienceFilter, storageKeys.audience, "patients");
  restoreSelect(categoryFilter, storageKeys.category);
  restoreSelect(tagFilter, storageKeys.tag);
  modelPill.innerHTML = `
    <button class="docs-link" type="button" id="docs-link">${metadata.documents} docs</button>
    <span>· ${escapeHtml(metadata.embedding_model)} · ${escapeHtml(metadata.chat_model)}</span>
  `;
  document.querySelector("#docs-link").addEventListener("click", showAllDocs);
  setActiveTab(localStorage.getItem(storageKeys.tab) || "sources");
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;

  debugEvents = [];
  const activeFilters = filters();
  const historyForRequest = conversationHistory.slice(-6);
  addDebugEvent("User submitted message", { question });
  addDebugEvent("Prepared conversation history", {
    turns_sent: historyForRequest.length,
    history: historyForRequest
  });
  addDebugEvent("Collected metadata filters", activeFilters);
  addMessage("user", question);
  questionInput.value = "";
  const pending = addMessage("assistant", "Thinking...");
  composer.querySelector("button").disabled = true;

  try {
    addDebugEvent("Sending /api/chat request", {
      endpoint: "/api/chat",
      method: "POST",
      payload: { question, filters: activeFilters, history: historyForRequest }
    });
    const requestStartedAt = performance.now();
    const result = await postJson("/api/chat", {
      question,
      filters: activeFilters,
      history: historyForRequest
    });
    addDebugEvent("Received /api/chat response", {
      round_trip_ms: Math.round(performance.now() - requestStartedAt),
      answer_character_count: result.answer.length,
      source_count: result.results.length
    });
    addDebugEvent("Query rewrite", result.debug.query_rewrite);
    addDebugEvent("Server retrieval and generation trace", result.debug);
    addDebugEvent("Final LLM input", {
      summary: result.debug.final_answer_input_summary,
      input: result.debug.final_answer_input
    });
    pending.querySelector("p").innerHTML = renderMarkdown(result.answer);
    renderSources(result.results);
    conversationHistory.push(
      { role: "user", content: question },
      { role: "assistant", content: result.answer }
    );
    conversationHistory = conversationHistory.slice(-8);
    addDebugEvent("Rendered answer and source cards", {
      rendered_sources: result.results.map((doc) => ({
        id: doc.id,
        title: doc.title,
        score: doc.score
      }))
    });
  } catch (error) {
    pending.classList.add("error");
    pending.querySelector("p").textContent = error.message;
    addDebugEvent("Request failed", { message: error.message });
  } finally {
    composer.querySelector("button").disabled = false;
    questionInput.focus();
  }
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
});

[audienceFilter, categoryFilter, tagFilter].forEach((select) => {
  select.addEventListener("change", persistFilters);
});

loadMetadata().catch((error) => {
  modelPill.textContent = "Index unavailable";
  addMessage("error", error.message);
});

docsModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-modal]")) {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !docsModal.hidden) {
    closeModal();
  }
});
