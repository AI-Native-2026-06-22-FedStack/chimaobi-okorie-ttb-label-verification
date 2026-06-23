const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "http://localhost:8000";
const CANONICAL_WARNING = "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const FIELD_LABELS = {
  brand_name: "Brand name",
  class_type: "Class / Type",
  abv: "Alcohol by volume",
  net_contents: "Net contents",
  producer: "Producer",
  country_of_origin: "Country of origin",
  government_warning: "Government warning"
};

const singleForm = document.getElementById("singleView");
const batchForm = document.getElementById("batchView");
const resultsView = document.getElementById("resultsView");
const batchResultsView = document.getElementById("batchResultsView");
const singleImageInput = document.getElementById("image");
const imagePreviewWrap = document.getElementById("imagePreviewWrap");
const singlePreviewImage = document.getElementById("singlePreviewImage");
const selectedFileName = document.getElementById("selectedFileName");
let singlePreviewUrl = null;

function setCanonicalWarnings() {
  document.querySelectorAll('[name="government_warning"]').forEach((input) => {
    input.value = CANONICAL_WARNING;
  });
}

setCanonicalWarnings();

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.remove("active");
      tab.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.remove("active");
      view.hidden = true;
    });
    resultsView.hidden = true;
    batchResultsView.hidden = true;

    button.classList.add("active");
    button.setAttribute("aria-selected", "true");
    const view = document.getElementById(`${button.dataset.view}View`);
    view.hidden = false;
    view.classList.add("active");
  });
});

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resetSinglePreview() {
  if (singlePreviewUrl) {
    URL.revokeObjectURL(singlePreviewUrl);
    singlePreviewUrl = null;
  }
  singlePreviewImage.removeAttribute("src");
  imagePreviewWrap.hidden = true;
  selectedFileName.textContent = "";
}

function updateSinglePreview(file) {
  if (!file) {
    resetSinglePreview();
    return;
  }
  if (singlePreviewUrl) URL.revokeObjectURL(singlePreviewUrl);
  singlePreviewUrl = URL.createObjectURL(file);
  singlePreviewImage.src = singlePreviewUrl;
  imagePreviewWrap.hidden = false;
  selectedFileName.textContent = `${file.name} - ${formatFileSize(file.size)}`;
}

singleImageInput.addEventListener("change", () => updateSinglePreview(singleImageInput.files[0]));
window.addEventListener("beforeunload", () => {
  if (singlePreviewUrl) URL.revokeObjectURL(singlePreviewUrl);
});

async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error("API returned an error");
    await response.json();
    document.documentElement.dataset.service = "ready";
  } catch (error) {
    document.documentElement.dataset.service = "unavailable";
  }
}

function collectApplicationData(scope) {
  const data = {};
  Object.keys(FIELD_LABELS).forEach((name) => {
    data[name] = scope.querySelector(`[name="${name}"]`).value.trim();
  });
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function showMessage(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function hideMessage(element) {
  element.textContent = "";
  element.hidden = true;
}

async function readError(response) {
  try {
    const payload = await response.json();
    return payload.detail || "The request could not be completed.";
  } catch (error) {
    return "The request could not be completed.";
  }
}

function renderVerification(result, target, verdictTarget = null, latencyTarget = null) {
  if (verdictTarget) {
    const approved = result.overall_verdict === "APPROVED";
    verdictTarget.className = `verdict-banner ${approved ? "approved" : "needs-review"}`;
    verdictTarget.querySelector("h2").textContent = approved ? "APPROVED" : "NEEDS REVIEW";
  }
  if (latencyTarget) {
    latencyTarget.textContent = `Completed in ${result.latency_ms} ms.`;
  }

  target.innerHTML = "";
  result.results.forEach((item) => {
    const row = document.createElement("article");
    row.className = `result-row ${item.status === "PASS" ? "pass" : "fail"}`;
    const label = FIELD_LABELS[item.field] || item.field;
    const failedMarkup = item.status === "FAIL"
      ? `<div class="result-details"><p><b>Expected:</b> ${escapeHtml(item.expected)}</p><p><b>Found:</b> ${escapeHtml(item.found || "Missing")}</p></div>`
      : "";
    row.innerHTML = `
      <div class="result-row-header">
        <div>
          <h3>${escapeHtml(label)}</h3>
          <p class="detail">${escapeHtml(item.detail)}</p>
        </div>
        <span class="result-status ${item.status === "PASS" ? "pass" : "fail"}">${item.status}</span>
      </div>
      ${failedMarkup}
    `;
    target.appendChild(row);
  });
}

singleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("singleError");
  const loading = document.getElementById("singleLoading");
  const button = document.getElementById("verifyButton");
  hideMessage(error);
  showMessage(loading, "Reading the label and comparing the application record.");
  resultsView.hidden = true;
  button.disabled = true;
  button.textContent = "Verifying...";

  try {
    const image = singleForm.querySelector('[name="image"]').files[0];
    if (!image) throw new Error("Choose a label image before submitting.");
    const data = new FormData();
    data.append("image", image);
    data.append("application_data", JSON.stringify(collectApplicationData(singleForm)));
    const response = await fetch(`${API_BASE_URL}/verify`, { method: "POST", body: data });
    if (!response.ok) throw new Error(await readError(response));
    renderVerification(
      await response.json(),
      document.getElementById("singleResults"),
      document.getElementById("singleVerdict"),
      document.getElementById("singleLatency")
    );
    singleForm.hidden = true;
    singleForm.classList.remove("active");
    resultsView.hidden = false;
    resultsView.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showMessage(error, err.message);
  } finally {
    hideMessage(loading);
    button.disabled = false;
    button.textContent = "Verify label";
  }
});

document.getElementById("resetButton").addEventListener("click", () => {
  singleForm.reset();
  setCanonicalWarnings();
  resetSinglePreview();
  hideMessage(document.getElementById("singleError"));
  resultsView.hidden = true;
  singleForm.hidden = false;
  singleForm.classList.add("active");
});

const batchRows = document.getElementById("batchRows");
const rowTemplate = document.getElementById("batchRowTemplate");

function addBatchRow() {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  const index = batchRows.children.length + 1;
  row.querySelector("legend").textContent = `Label ${index}`;
  row.querySelector('[name="item_id"]').value = `Label ${index}`;
  row.querySelector('[name="government_warning"]').value = CANONICAL_WARNING;
  row.querySelector(".remove").addEventListener("click", () => {
    row.remove();
  });
  batchRows.appendChild(row);
}

document.getElementById("addBatchRow").addEventListener("click", addBatchRow);
addBatchRow();

batchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("batchError");
  const progress = document.getElementById("batchProgress");
  const button = document.getElementById("batchSubmitButton");
  hideMessage(error);
  showMessage(progress, "Reading the labels and comparing each application record.");
  batchResultsView.hidden = true;
  button.disabled = true;
  button.textContent = "Verifying batch...";

  try {
    const rows = [...batchRows.children];
    if (!rows.length) throw new Error("Add at least one batch row.");
    const data = new FormData();
    const items = rows.map((row, index) => {
      const file = row.querySelector('[name="batch_image"]').files[0];
      if (!file) throw new Error(`Choose an image for Label ${index + 1}.`);
      data.append("images", file);
      return {
        id: row.querySelector('[name="item_id"]').value.trim() || `Label ${index + 1}`,
        application_data: collectApplicationData(row)
      };
    });
    data.append("items", JSON.stringify(items));
    const response = await fetch(`${API_BASE_URL}/verify/batch`, { method: "POST", body: data });
    if (!response.ok) throw new Error(await readError(response));
    renderBatch(await response.json());
    batchResultsView.hidden = false;
    batchResultsView.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    showMessage(error, err.message);
  } finally {
    hideMessage(progress);
    button.disabled = false;
    button.textContent = "Verify batch";
  }
});

function renderBatch(result) {
  document.getElementById("passedCount").textContent = result.summary.passed;
  document.getElementById("reviewCount").textContent = result.summary.needs_review;
  document.getElementById("totalCount").textContent = result.summary.total;

  const target = document.getElementById("batchResults");
  target.innerHTML = "";
  result.items.forEach((item, index) => {
    const wrapper = document.createElement("article");
    wrapper.className = "batch-result-card";
    if (item.error) {
      wrapper.classList.add("fail");
      wrapper.innerHTML = `
        <div class="batch-result-header">
          <h3>${escapeHtml(item.item_id)}</h3>
          <span class="result-status fail">ERROR</span>
        </div>
        <p class="batch-card-summary">${escapeHtml(item.error)}</p>
      `;
    } else {
      const nestedId = `batch-detail-${index}`;
      const approved = item.result.overall_verdict === "APPROVED";
      wrapper.classList.add(approved ? "pass" : "fail");
      wrapper.innerHTML = `
        <div class="batch-result-header">
          <h3>${escapeHtml(item.item_id)}</h3>
          <span class="result-status ${approved ? "pass" : "fail"}">${approved ? "APPROVED" : "NEEDS REVIEW"}</span>
        </div>
        <p class="batch-card-summary">${item.result.results.filter((field) => field.status === "FAIL").length} field(s) need attention.</p>
        <button class="secondary-button compact detail-toggle" type="button" aria-expanded="false" aria-controls="${nestedId}">Show details</button>
        <div id="${nestedId}" class="result-list batch-drilldown" hidden></div>
      `;
      const button = wrapper.querySelector("button");
      const nested = wrapper.querySelector(`#${nestedId}`);
      button.addEventListener("click", () => {
        const hidden = nested.hasAttribute("hidden");
        if (hidden) {
          nested.removeAttribute("hidden");
          button.textContent = "Hide details";
          button.setAttribute("aria-expanded", "true");
          renderVerification(item.result, nested);
        } else {
          nested.setAttribute("hidden", "");
          button.textContent = "Show details";
          button.setAttribute("aria-expanded", "false");
        }
      });
    }
    target.appendChild(wrapper);
  });
}

checkHealth();
