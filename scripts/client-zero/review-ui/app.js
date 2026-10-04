"use strict";

const FIELD_META = {
  invoiceNumber: { label: "Invoice number", role: null },
  invoiceDate: { label: "Issue date", role: null },
  dueDate: { label: "Due date — does it appear on the document at all?", role: null },
  amountCents: { label: "Nominal documented amount", role: null },
  currency: { label: "Currency", role: null },
  cuit: { label: "CUIT", role: null },
  description: { label: "Description / concept", role: null },
  issuer: { label: "Issuer", role: "issuer" },
  billedParty: { label: "Billed / customer entity", role: "customer" },
  administration: { label: "Administration", role: "administration" },
  building: { label: "Consorcio / building", role: "building" },
  address: { label: "Property / address", role: "address" },
  servicePeriod: { label: "Service / billing period observation", role: "service period", observationOnly: true },
};
const FIELD_ORDER = ["invoiceNumber", "invoiceDate", "dueDate", "amountCents", "currency", "issuer", "billedParty", "administration", "building", "servicePeriod", "address", "cuit", "description"];
const STATUSES = ["UNREVIEWED", "CORRECT", "INCORRECT", "NOT_PRESENT_IN_DOCUMENT", "UNCERTAIN"];
const VERIFIER_FIELD = { invoiceNumber: "invoiceNumber", invoiceDate: "issueDate", dueDate: "documentedDueDate", amountCents: "nominalAmount", currency: "currency", issuer: "issuer", billedParty: "billedCustomer", administration: "administration", building: "building", servicePeriod: "servicePeriod" };

const reviewerInput = document.getElementById("reviewer");
reviewerInput.value = localStorage.getItem("cz-reviewer") || "";
reviewerInput.addEventListener("change", () => localStorage.setItem("cz-reviewer", reviewerInput.value));

let documents = [];
let activeId = null;
let activeFilter = "ALL";

function comparisonStatuses(entry) { return Object.values(entry.comparison?.fields || {}).map((field) => field.status); }
function matchesFilter(entry) {
  const statuses = comparisonStatuses(entry);
  if (activeFilter === "ALL") return true;
  if (activeFilter === "AUTO_VERIFIED") return statuses.length > 0 && statuses.every((status) => status === "AUTO_VERIFIED_MATCH" || status === "AUTO_VERIFIED_ABSENT");
  if (activeFilter === "DISAGREEMENTS") return statuses.includes("DISAGREEMENT");
  if (activeFilter === "AMBIGUOUS") return statuses.includes("AMBIGUOUS");
  if (activeFilter === "NEEDS_HUMAN_REVIEW") return statuses.some((status) => ["DISAGREEMENT", "AMBIGUOUS", "HUMAN_REVIEW"].includes(status));
  return Object.values(entry.groundTruth?.fields || {}).some((field) => field.status === "UNREVIEWED");
}

async function loadDocuments() {
  const response = await fetch("/api/documents");
  const payload = await response.json();
  documents = payload;
  renderDocList();
  if (!activeId && documents.length > 0) selectDocument(documents[0].proposal.privateSafeDocumentId);
}

function renderDocList() {
  const container = document.getElementById("doc-list-items");
  container.innerHTML = "";
  const visible = documents.filter(matchesFilter).sort((a, b) => Number(comparisonStatuses(b).some((s) => ["DISAGREEMENT", "AMBIGUOUS", "HUMAN_REVIEW"].includes(s))) - Number(comparisonStatuses(a).some((s) => ["DISAGREEMENT", "AMBIGUOUS", "HUMAN_REVIEW"].includes(s))));
  document.getElementById("queue-summary").textContent = `${visible.length} of ${documents.length} documents`;
  for (const entry of visible) {
    const id = entry.proposal.privateSafeDocumentId;
    const status = entry.groundTruth ? entry.groundTruth.status : "UNREVIEWED";
    const button = document.createElement("button");
    button.className = `status-${status}` + (id === activeId ? " active" : "");
    button.innerHTML = `<span class="status-dot"></span>${id.replace("client-zero-canary-", "Doc ")}`;
    button.addEventListener("click", () => selectDocument(id));
    container.appendChild(button);
  }
}

function selectDocument(id) {
  activeId = id;
  renderDocList();
  const entry = documents.find((d) => d.proposal.privateSafeDocumentId === id);
  if (!entry) return;
  document.getElementById("pdf-frame").src = `/api/documents/${id}/pdf`;
  document.getElementById("doc-heading").textContent = id.replace("client-zero-canary-", "Document ");
  const reasons = entry.proposal.reviewReasons || [];
  document.getElementById("review-reasons").textContent = reasons.length ? `Pipeline review reasons: ${reasons.join(", ")}` : "";
  renderFields(entry);
}

function renderFields(entry) {
  const container = document.getElementById("fields-container");
  container.innerHTML = "";
  const groundTruthFields = entry.groundTruth ? entry.groundTruth.fields : {};
  for (const fieldName of FIELD_ORDER) {
    const meta = FIELD_META[fieldName];
    const proposal = entry.proposal.fields[fieldName] || { raw: null, normalized: null, sourceLocation: null };
    const label = groundTruthFields[fieldName] || { status: "UNREVIEWED", correctedValue: null, note: null };

    const card = document.createElement("div");
    const verifierField = VERIFIER_FIELD[fieldName];
    const observation = verifierField ? entry.independentVerification?.fields?.[verifierField] : null;
    const comparison = verifierField ? entry.comparison?.fields?.[verifierField] : null;
    card.className = "field-card" + (meta.role ? " identity" : "") + (comparison ? ` comparison-${comparison.status}` : "");

    const title = document.createElement("div");
    title.className = "field-name";
    title.innerHTML = `<span>${meta.label}</span>${meta.role ? `<span class="field-role">${meta.role}</span>` : ""}`;
    card.appendChild(title);

    const layers = [
      ["pipeline", "RECOVERIA", proposal.raw === null || proposal.raw === "" ? "NOT FOUND" : proposal.raw],
      ["verifier", "INDEPENDENT VERIFIER", observation ? `${observation.status}${observation.rawObservedValue ? ` — ${observation.rawObservedValue}` : ""} · ${observation.confidence} · page ${observation.page ?? "—"}` : "NOT COMPARABLE"],
      ["comparison", "COMPARISON", comparison?.status || "NOT COMPARABLE"],
      ["ground-truth", "FOUNDER GROUND TRUTH", meta.observationOnly ? "NOT IN FOUNDER LABEL SET" : label.status],
    ];
    for (const [className, layerTitle, value] of layers) { const layer = document.createElement("div"); layer.className = `layer ${className}`; const heading = document.createElement("div"); heading.className = "layer-title"; heading.textContent = layerTitle; const body = document.createElement("div"); body.textContent = value; layer.append(heading, body); card.appendChild(layer); }

    const provenance = document.createElement("div");
    provenance.className = "provenance";
    provenance.textContent = proposal.sourceLocation ? `Evidence: ${JSON.stringify(proposal.sourceLocation)}` : "Evidence: none captured";
    card.appendChild(provenance);

    if (meta.observationOnly) { container.appendChild(card); continue; }
    const statusRow = document.createElement("div");
    statusRow.className = "status-row";
    for (const status of STATUSES) {
      const button = document.createElement("button");
      button.textContent = status.replace(/_/g, " ");
      if (status === label.status) button.classList.add("selected");
      button.addEventListener("click", () => saveLabel(entry.proposal.privateSafeDocumentId, fieldName, status, correctedInput.value || null));
      statusRow.appendChild(button);
    }
    card.appendChild(statusRow);

    const correctedInput = document.createElement("input");
    correctedInput.className = "corrected-value";
    correctedInput.placeholder = "Correct documentary value (only if INCORRECT)";
    correctedInput.value = label.correctedValue || "";
    correctedInput.style.display = label.status === "INCORRECT" ? "block" : "none";
    correctedInput.addEventListener("change", () => saveLabel(entry.proposal.privateSafeDocumentId, fieldName, "INCORRECT", correctedInput.value));
    card.appendChild(correctedInput);

    container.appendChild(card);
  }
}

async function saveLabel(documentId, fieldName, status, correctedValue) {
  const reviewer = reviewerInput.value.trim();
  if (!reviewer) { alert("Enter a reviewer name first."); return; }
  const response = await fetch(`/api/documents/${documentId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fieldName, status, correctedValue: status === "INCORRECT" ? correctedValue : null, reviewer }) });
  if (!response.ok) { alert(`Save failed: ${(await response.json()).error}`); return; }
  await loadDocuments();
  selectDocument(documentId);
}

document.getElementById("refresh-evaluation").addEventListener("click", async () => {
  const response = await fetch("/api/evaluation");
  document.getElementById("evaluation-output").textContent = JSON.stringify(await response.json(), null, 2);
});

document.getElementById("document-filter").addEventListener("change", (event) => { activeFilter = event.target.value; renderDocList(); });

void loadDocuments();
