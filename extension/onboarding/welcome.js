import { Storage } from "../lib/storage.js";
import { TMTClient } from "../lib/api.js";
import { MSG } from "../lib/messages.js";

const els = {
  apiKey: document.getElementById("apiKey"),
  saveKey: document.getElementById("saveKey"),
  keyForm: document.getElementById("keyForm"),
  keyStatus: document.getElementById("keyStatus"),
  sampleSrc: document.getElementById("sampleSrc"),
  sampleTgt: document.getElementById("sampleTgt"),
  sampleInput: document.getElementById("sampleInput"),
  sampleRun: document.getElementById("sampleRun"),
  sampleOutput: document.getElementById("sampleOutput"),
  finish: document.getElementById("finish"),
  immersionToggle: document.getElementById("immersionToggle"),
  immersionTargetSel: document.getElementById("immersionTargetSel"),
  immersionGoalInp: document.getElementById("immersionGoalInp"),
};

init();

async function init() {
  const stored = await Storage.getApiKey();
  if (stored) {
    els.apiKey.value = stored;
    els.sampleRun.disabled = false;
    setKeyStatus("Key already saved.", "ok");
  }
  const settings = await Storage.getSettings();
  els.immersionToggle.checked = Boolean(settings.immersionEnabled);
  els.immersionTargetSel.value = settings.immersionTarget || "tmg";
  els.immersionGoalInp.value = settings.immersionDailyGoal ?? 5;
  bindEvents();
}

function bindEvents() {
  els.keyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const key = els.apiKey.value.trim();
    if (!key) {
      setKeyStatus("Paste your TMT team token first.", "err");
      return;
    }
    await Storage.setApiKey(key);
    els.sampleRun.disabled = false;
    setKeyStatus("Saved. You can now translate.", "ok");
    Storage.markOnboarded();
  });

  els.sampleRun.addEventListener("click", runSample);

  els.sampleInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      runSample();
    }
  });

  els.finish.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  els.immersionToggle.addEventListener("change", saveImmersion);
  els.immersionTargetSel.addEventListener("change", saveImmersion);
  els.immersionGoalInp.addEventListener("change", saveImmersion);

  guardLanguagePair();
  els.sampleSrc.addEventListener("change", guardLanguagePair);
  els.sampleTgt.addEventListener("change", guardLanguagePair);
}

async function saveImmersion() {
  await Storage.patchSettings({
    immersionEnabled: els.immersionToggle.checked,
    immersionTarget: els.immersionTargetSel.value,
    immersionDailyGoal: Math.max(
      1,
      Math.min(50, Number(els.immersionGoalInp.value) || 5),
    ),
  });
}

function guardLanguagePair() {
  if (els.sampleSrc.value === els.sampleTgt.value) {
    const opts = ["eng", "nep", "tmg"];
    els.sampleTgt.value = opts.find((c) => c !== els.sampleSrc.value);
  }
}

async function runSample() {
  const text = els.sampleInput.value.trim();
  if (!text) {
    els.sampleOutput.textContent = "Type something to translate.";
    return;
  }
  const apiKey = await Storage.getApiKey();
  if (!apiKey) {
    setKeyStatus("Save your token first.", "err");
    return;
  }
  els.sampleRun.disabled = true;
  els.sampleOutput.textContent = "Translating…";
  try {
    const client = new TMTClient({ apiKey, maxRetries: 1 });
    const result = await client.translate(text, els.sampleSrc.value, els.sampleTgt.value);
    els.sampleOutput.textContent = result.output || "(empty response)";
  } catch (err) {
    els.sampleOutput.textContent = err?.message || "Translation failed.";
  } finally {
    els.sampleRun.disabled = false;
  }
}

function setKeyStatus(text, state) {
  els.keyStatus.textContent = text;
  els.keyStatus.dataset.state = state;
}
