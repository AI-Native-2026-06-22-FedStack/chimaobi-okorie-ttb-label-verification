const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "http://localhost:8000";
const CANONICAL_WARNING = "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

const FIELD_LABELS = {
  brand_name: "Brand name",
  class_type: "Class or type",
  abv: "Alcohol content",
  net_contents: "Net contents",
  producer: "Producer",
  country_of_origin: "Country of origin",
  government_warning: "Government warning"
};

document.querySelectorAll('[name="government_warning"]').forEach((input) => {
  input.value = CANONICAL_WARNING;
});

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    button.classList.add("active");
    document.getElementById(`${button.dataset.view}View`).classList.add("active");
  });
});

async function checkHealth() {
  const target = document.getElementById("healthStatus");
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error("API returned an error");
    const payload = await response.json();
    target.textContent = `${payload.status.toUpperCase()} - API connected`;
    target.className = "api-status ok";
  } catch (error) {
    target.textContent = "API not connected";
    target.className = "api-status error";
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
    verdictTarget.textContent = approved ? "APPROVED" : "NEEDS REVIEW";
    verdictTarget.className = `verdict ${approved ? "pass" : "fail"}`;
  }
  if (latencyTarget) {
    latencyTarget.textContent = `Completed in ${result.latency_ms} ms.`;
  }
  target.innerHTML = "";
  result.results.forEach((item) => {
    const row = document.createElement("article");
    row.className = "field-result";
    const label = FIELD_LABELS[item.field] || item.field;
    const failedMarkup = item.status === "FAIL"
      ? `<div class="diff"><span><b>Expected:</b> ${escapeHtml(item.expected)}</span><span><b>Found:</b> ${escapeHtml(item.found || "Missing")}</span></div>`
      : "";
    row.innerHTML = `
      <div class="result-title">
        <strong>${escapeHtml(label)}</strong>
        <span class="badge ${item.status === "PASS" ? "pass" : "fail"}">${item.status}</span>
      </div>
      <p class="detail">${escapeHtml(item.detail)}</p>
      ${failedMarkup}
    `;
    target.appendChild(row);
  });
}

document.getElementById("singleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = document.getElementById("singleError");
  const button = form.querySelector("button[type='submit']");
  error.textContent = "";
  button.disabled = true;
  button.textContent = "Checking...";

  try {
    const image = form.image.files[0];
    if (!image) throw new Error("Choose a label image before submitting.");
    const data = new FormData();
    data.append("image", image);
    data.append("application_data", JSON.stringify(collectApplicationData(form)));
    const response = await fetch(`${API_BASE_URL}/verify`, { method: "POST", body: data });
    if (!response.ok) throw new Error(await readError(response));
    renderVerification(
      await response.json(),
      document.getElementById("singleResults"),
      document.getElementById("singleVerdict"),
      document.getElementById("singleLatency")
    );
  } catch (err) {
    error.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = "Verify label";
  }
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

document.getElementById("batchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = document.getElementById("batchError");
  const progress = document.getElementById("batchProgress");
  const button = event.currentTarget.querySelector("button[type='submit']");
  error.textContent = "";
  progress.textContent = "Checking batch...";
  button.disabled = true;

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
    progress.textContent = "Batch complete.";
  } catch (err) {
    error.textContent = err.message;
    progress.textContent = "Batch stopped.";
  } finally {
    button.disabled = false;
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
    wrapper.className = "batch-result";
    if (item.error) {
      wrapper.innerHTML = `<strong>${escapeHtml(item.item_id)}</strong><span class="badge fail">ERROR</span><p class="detail">${escapeHtml(item.error)}</p>`;
    } else {
      const nestedId = `batch-detail-${index}`;
      const approved = item.result.overall_verdict === "APPROVED";
      wrapper.innerHTML = `
        <div class="result-title">
          <strong>${escapeHtml(item.item_id)}</strong>
          <span class="badge ${approved ? "pass" : "fail"}">${approved ? "APPROVED" : "NEEDS REVIEW"}</span>
        </div>
        <button class="secondary detail-toggle" type="button" aria-expanded="false" aria-controls="${nestedId}">Show details</button>
        <div id="${nestedId}" class="result-list nested" hidden></div>
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
