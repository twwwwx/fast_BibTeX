const DEFAULT_TIMEOUT_MS = 25000;

function waitForTabComplete(tabId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for tab to load."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
    }

    function listener(updatedTabId, info) {
      if (updatedTabId === tabId && info.status === "complete") {
        cleanup();
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) return;
      if (tab && tab.status === "complete") {
        cleanup();
        resolve();
      }
    });
  });
}

async function runInTab(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  return result?.result;
}

async function getBibtexLinkFromScholar(tabId) {
  return runInTab(tabId, async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const tryConsent = () => {
      const texts = ["I agree", "Accept all", "Accept", "Agree", "Yes, I agree"];
      const buttons = Array.from(document.querySelectorAll("button"));
      for (const text of texts) {
        const btn = buttons.find((b) => b.textContent.trim() === text);
        if (btn) {
          btn.click();
          return true;
        }
      }
      return false;
    };

    tryConsent();

    if (document.querySelector("form#gs_captcha")) {
      return { ok: false, error: "Captcha detected. Please solve it in a normal tab." };
    }

    let firstResult = null;
    for (let i = 0; i < 40; i += 1) {
      firstResult = document.querySelector("div.gs_r");
      if (firstResult) break;
      await sleep(500);
    }
    if (!firstResult) {
      return { ok: false, error: "No search results found." };
    }

    const citeBtn = firstResult.querySelector("a.gs_or_cit");
    if (!citeBtn) {
      return { ok: false, error: "Cite button not found." };
    }
    citeBtn.click();

    let bibtexLink = null;
    for (let i = 0; i < 40; i += 1) {
      const links = Array.from(document.querySelectorAll("a.gs_citi"));
      bibtexLink = links.find((a) => a.textContent.includes("BibTeX"));
      if (bibtexLink) break;
      await sleep(250);
    }
    if (!bibtexLink) {
      return { ok: false, error: "BibTeX link not found." };
    }

    return { ok: true, link: bibtexLink.href };
  });
}

async function getBibtexFromTab(tabId) {
  return runInTab(tabId, () => {
    const text = document.body ? document.body.innerText.trim() : "";
    return text || null;
  });
}

async function fetchBibtex(query) {
  const searchUrl =
    "https://scholar.google.com/scholar?q=" + encodeURIComponent(query);
  const scholarTab = await chrome.tabs.create({ url: searchUrl, active: false });

  try {
    await waitForTabComplete(scholarTab.id);
    const linkResult = await getBibtexLinkFromScholar(scholarTab.id);
    if (!linkResult?.ok) {
      throw new Error(linkResult?.error || "Failed to locate BibTeX link.");
    }

    const bibtexTab = await chrome.tabs.create({
      url: linkResult.link,
      active: false,
    });

    try {
      await waitForTabComplete(bibtexTab.id);
      const bibtex = await getBibtexFromTab(bibtexTab.id);
      if (!bibtex) {
        throw new Error("BibTeX page was empty.");
      }
      return bibtex;
    } finally {
      chrome.tabs.remove(bibtexTab.id);
    }
  } finally {
    chrome.tabs.remove(scholarTab.id);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FETCH_BIBTEX") return;

  fetchBibtex(message.query)
    .then((bibtex) => sendResponse({ ok: true, bibtex }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));

  return true;
});
