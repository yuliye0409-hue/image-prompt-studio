const SETTINGS_KEY = "imagePromptStudioSettings";
const HOVER_KEY = "imagePromptStudioHover";
const DEFAULT_SETTINGS = {
  provider: "openaiCompatible",
  apiKey: "",
  baseUrl: "https://ai.gs88.shop",
  model: "gpt-5.5",
  reasoningEffort: "medium",
  promptStyle: "universal"
};

const PROMPT_STYLES = new Set(["universal", "productAppearance", "localizedMarketing"]);
const PROVIDER_DEFAULTS = {
  openaiCompatible: {
    baseUrl: "https://ai.gs88.shop",
    model: "gpt-5.5",
    keyUrl: "https://ai.gs88.shop"
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com",
    model: "gemini-3.5-flash",
    keyUrl: "https://aistudio.google.com/app/apikey"
  }
};

const form = document.querySelector("#settingsForm");
const provider = document.querySelector("#provider");
const apiKey = document.querySelector("#apiKey");
const getApiKey = document.querySelector("#getApiKey");
const baseUrl = document.querySelector("#baseUrl");
const model = document.querySelector("#model");
const promptStyle = document.querySelector("#promptStyle");
const saveStatus = document.querySelector("#saveStatus");

loadSettings();

getApiKey.addEventListener("click", () => {
  const keyUrl = PROVIDER_DEFAULTS[provider.value]?.keyUrl;
  if (keyUrl) window.open(keyUrl, "_blank", "noopener");
});

provider.addEventListener("change", () => {
  const defaults = PROVIDER_DEFAULTS[provider.value];
  if (!defaults) return;
  apiKey.value = "";
  baseUrl.value = defaults.baseUrl;
  model.value = defaults.model;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const settings = {
    provider: provider.value,
    apiKey: apiKey.value.trim(),
    baseUrl: normalizeBaseUrl(baseUrl.value.trim()),
    model: model.value.trim() || DEFAULT_SETTINGS.model,
    reasoningEffort: DEFAULT_SETTINGS.reasoningEffort,
    promptStyle: promptStyle.value
  };

  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  const blockedHosts = [...new Set(document.querySelector("#disabledHoverHosts").value.split(/\r?\n/).map(line => {
    try { return new URL(line.trim().includes("://") ? line.trim() : "https://" + line.trim()).hostname.toLowerCase(); } catch { return ""; }
  }).filter(Boolean))];
  await chrome.storage.local.set({ [HOVER_KEY]: { enabled: document.querySelector("#hoverEnabled").value === "true", blockedHosts } });
  saveStatus.textContent = "已保存";
  setTimeout(() => {
    saveStatus.textContent = "";
  }, 1600);
});

async function loadSettings() {
  const hover = (await chrome.storage.local.get(HOVER_KEY))[HOVER_KEY] || {};
  document.querySelector("#hoverEnabled").value = hover.enabled === false ? "false" : "true";
  document.querySelector("#disabledHoverHosts").value = (hover.blockedHosts || []).join("\n");
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] || {};
  const settings = {
    ...DEFAULT_SETTINGS,
    ...saved
  };

  provider.value = PROVIDER_DEFAULTS[settings.provider]
    ? settings.provider
    : DEFAULT_SETTINGS.provider;
  apiKey.value = settings.apiKey;
  baseUrl.value = settings.baseUrl || PROVIDER_DEFAULTS[provider.value].baseUrl;
  model.value = settings.model || PROVIDER_DEFAULTS[provider.value].model;
  promptStyle.value = PROMPT_STYLES.has(settings.promptStyle)
    ? settings.promptStyle
    : DEFAULT_SETTINGS.promptStyle;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}
