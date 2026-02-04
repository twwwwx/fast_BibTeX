const queryInput = document.getElementById("query");
const fetchBtn = document.getElementById("fetch");
const copyBtn = document.getElementById("copy");
const statusEl = document.getElementById("status");
const bibtexEl = document.getElementById("bibtex");

function setStatus(message) {
  statusEl.textContent = message;
}

function sendMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => resolve(response));
  });
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
}

async function onFetch() {
  const query = queryInput.value.trim();
  if (!query) {
    setStatus("Please enter a reference name.");
    return;
  }

  fetchBtn.disabled = true;
  copyBtn.disabled = true;
  setStatus("Fetching BibTeX...");

  const response = await sendMessage({ type: "FETCH_BIBTEX", query });
  fetchBtn.disabled = false;

  if (!response || !response.ok) {
    setStatus(response?.error || "Failed to fetch BibTeX.");
    return;
  }

  bibtexEl.value = response.bibtex;
  copyBtn.disabled = false;

  const copied = await copyToClipboard(response.bibtex);
  setStatus(copied ? "Copied BibTeX to clipboard." : "Fetched. Click Copy to copy.");
}

fetchBtn.addEventListener("click", onFetch);
copyBtn.addEventListener("click", async () => {
  if (!bibtexEl.value) return;
  const copied = await copyToClipboard(bibtexEl.value);
  setStatus(copied ? "Copied BibTeX to clipboard." : "Copy failed.");
});

queryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    onFetch();
  }
});
