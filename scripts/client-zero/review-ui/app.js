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
};
const FIELD_ORDER = ["invoiceNumber", "invoiceDate", "dueDate", "amountCents", "currency", "issuer", "billedParty", "administration", "building", "address", "cuit", "description"];
const STATUSES = ["UNREVIEWED", "CORRECT", "INCORRECT", "NOT_PRESENT_IN_DOCUMENT", "UNCERTAIN"];

const reviewerInput = document.getElementById("reviewer");
reviewerInput.value = localStorage.getItem("cz-reviewer") || "";
reviewerInput.addEventListener("change", () => localStorage.setItem("cz-reviewer", reviewerInput.value));

let documents = [];
let activeId = null;

async function loadDocuments() {
  const response = await fetch("/api/documents");
  const payload = await response.json();
  documents = payload;
  renderDocList();
  if (!activeId && documents.length > 0) selectDocument(documents[0].proposal.privateSafeDocumentId);
}

function renderDocList() {
  const container = document.getElementById("doc-list");
  container.innerHTML = "";
  for (const entry of documents) {
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
    card.className = "field-card" + (meta.role ? " identity" : "");

    const title = document.createElement("div");
    title.className = "field-name";
    title.innerHTML = `<span>${meta.label}</span>${meta.role ? `<span class="field-role">${meta.role}</span>` : ""}`;
    card.appendChild(title);

    const proposedValue = document.createElement("div");
    proposedValue.className = "proposed-value";
    proposedValue.textContent = `Recoveria proposes: ${proposal.raw === null || proposal.raw === "" ? "(nothing — field not found)" : proposal.raw}`;
    card.appendChild(proposedValue);

    const provenance = document.createElement("div");
    provenance.className = "provenance";
    provenance.textContent = proposal.sourceLocation ? `Evidence: ${JSON.stringify(proposal.sourceLocation)}` : "Evidence: none captured";
    card.appendChild(provenance);

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

void loadDocuments();
