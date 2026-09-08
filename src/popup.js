const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const previewSection = document.querySelector("#previewSection");
const previewGrid = document.querySelector("#previewGrid");
const statusBox = document.querySelector("#statusBox");
const statusTitle = document.querySelector("#statusTitle");
const statusText = document.querySelector("#statusText");
const statusMeta = document.querySelector("#statusMeta");
const progressValue = document.querySelector("#progressValue");
const progressBar = document.querySelector("#progressBar");
const errorSection = document.querySelector("#errorSection");
const errorCode = document.querySelector("#errorCode");
const errorMessage = document.querySelector("#errorMessage");
const errorSuggestion = document.querySelector("#errorSuggestion");
const retryButton = document.querySelector("#retryButton");
const openSettingsFromError = document.querySelector("#openSettingsFromError");
const resultSection = document.querySelector("#resultSection");
const resultText = document.querySelector("#resultText");
const analyzeButton = document.querySelector("#analyzeButton");
const stopButton = document.querySelector("#stopButton");
const copyResult = document.querySelector("#copyResult");
const openOptions = document.querySelector("#openOptions");
const pinPanel = document.querySelector("#pinPanel");
const promptStyle = document.querySelector("#promptStyle");
const promptStyleHint = document.querySelector("#promptStyleHint");
const marketingContext = document.querySelector("#marketingContext");
const targetMarket = document.querySelector("#targetMarket");
const sellingPoints = document.querySelector("#sellingPoints");

const SETTINGS_KEY = "imagePromptStudioSettings";
const LAST_RESULT_KEY = "imagePromptStudioLastResult";
const DEFAULT_PROMPT_STYLE = "universal";
const MAX_IMAGES = 6;
const MAX_IMAGE_EDGE = 1600;
const OPTIMIZED_IMAGE_TYPE = "image/jpeg";
const OPTIMIZED_IMAGE_QUALITY = 0.82;
const surface = document.body.dataset.surface || "popup";

let selectedImages = [];
let lastJob = null;
let currentJobId = null;

const promptStyleHints = {
  universal: "综合主体、构图、背景、灯光和风格生成通用 Prompt，只预留纯净留白空间，不生成文案。",
  productAppearance: "约 80 字内精炼提取外观、形态、材质、纹理和结构细节。",
  localizedMarketing: "逐张替换为目标市场语言，主文案强制两行，小字也本地化，并统一多图排版风格。"
};

const supportedImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
  "image/tiff"
]);

hydrateLastResult();
loadPromptStyle();

setInterval(() => {
  if (lastJob?.status === "loading") renderStoredResult(lastJob);
}, 1000);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[LAST_RESULT_KEY]) return;
  renderStoredResult(changes[LAST_RESULT_KEY].newValue);
});

openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
openSettingsFromError.addEventListener("click", () => chrome.runtime.openOptionsPage());
pinPanel.addEventListener("click", openPinnedPanel);
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  fileInput.click();
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const files = Array.from(event.dataTransfer.files || []);
  if (files.length) await useFiles(files);
});

document.addEventListener("paste", async (event) => {
  const files = getImageFilesFromClipboard(event.clipboardData);
  if (!files.length) {
    if (isEditableTarget(event.target)) return;
    flashDropZone("paste-error");
    showClientError({
      code: "NO_CLIPBOARD_IMAGE",
      message: "剪贴板里没有可用图片。",
      suggestion: "请先复制图片或截图，再在插件界面按 Ctrl+V。"
    });
    return;
  }

  event.preventDefault();
  flashDropZone("pasted");
  await useFiles(files, { sourceName: "剪贴板图片" });
});

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  if (files.length) await useFiles(files);
  fileInput.value = "";
});

analyzeButton.addEventListener("click", startUploadAnalysis);
stopButton.addEventListener("click", stopActiveJob);
retryButton.addEventListener("click", retryAnalysis);
promptStyle.addEventListener("change", () => {
  updateMarketingContextVisibility();
  savePromptStyle();
});

copyResult.addEventListener("click", async () => {
  await navigator.clipboard.writeText(resultText.value);
  copyResult.textContent = "已复制";
  setTimeout(() => {
    copyResult.textContent = "复制";
  }, 1400);
});

async function useFiles(files, options = {}) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (!imageFiles.length) {
    showClientError({
      code: "NOT_IMAGE",
      message: "请选择图片文件。",
      suggestion: "支持 PNG、JPG、WebP、HEIC、HEIF、GIF、BMP 或 TIFF。"
    });
    return;
  }

  const unsupported = imageFiles.find((file) => !supportedImageTypes.has(file.type));
  if (unsupported) {
    showClientError({
      code: "UNSUPPORTED_IMAGE_TYPE",
      message: `暂不支持 ${unsupported.type} 图片。`,
      suggestion: "请使用 PNG、JPG、WebP、HEIC、HEIF、GIF、BMP 或 TIFF。"
    });
    return;
  }

  const availableSlots = MAX_IMAGES - selectedImages.length;
  if (availableSlots <= 0) {
    showClientError({
      code: "IMAGE_LIMIT_REACHED",
      message: `最多只能添加 ${MAX_IMAGES} 张图片。`,
      suggestion: "请先移除不需要的图片，再继续添加。"
    });
    return;
  }

  clearResult();
  errorSection.hidden = true;
  setProgress(0);
  setStatus({
    title: "正在优化图片",
    detail: "正在压缩图片尺寸，减少 API 请求体积和超时概率。",
    meta: "",
    state: "loading"
  });

  try {
    const acceptedFiles = imageFiles.slice(0, availableSlots);
    const loadedImages = await Promise.all(acceptedFiles.map(async (file, index) => {
      const optimized = await optimizeImageFile(file);
      return {
        mimeType: optimized.mimeType,
        data: optimized.data,
        previewUrl: optimized.previewUrl,
        name: file.name || `${options.sourceName || "图片"} ${selectedImages.length + index + 1}`,
        size: optimized.size,
        originalSize: file.size,
        optimized: optimized.optimized
      };
    }));

    selectedImages = [...selectedImages, ...loadedImages].slice(0, MAX_IMAGES);
    renderPreviewGrid();
    errorSection.hidden = true;
    setBusy(false);
    setProgress(0);

    const skippedCount = imageFiles.length - acceptedFiles.length;
    setStatus({
      title: `已添加 ${selectedImages.length} 张图片`,
      detail: skippedCount > 0
        ? `最多支持 ${MAX_IMAGES} 张，已自动忽略 ${skippedCount} 张。`
        : "可以生成中文和英文两套 Prompt。",
      meta: selectedImages.map(formatImageMeta).join("；"),
      state: "idle"
    });
  } catch (error) {
    showClientError({
      code: "IMAGE_LOAD_ERROR",
      message: error?.message || "图片读取失败。",
      suggestion: "请换一张图片再试，或检查浏览器是否允许读取本地文件。"
    });
  }
}

function startUploadAnalysis() {
  if (!selectedImages.length) return;

  clearResult();
  errorSection.hidden = true;
  setBusy(true);

  chrome.runtime.sendMessage(
    {
      type: "startAnalysis",
      images: selectedImages.map(({ mimeType, data }) => ({ mimeType, data })),
      sourceType: "upload",
      promptStyle: promptStyle.value,
      promptContext: getPromptContext()
    },
    (response) => {
      setBusy(false);
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        showClientError({
          code: "RUNTIME_ERROR",
          message: runtimeError.message,
          suggestion: "请重新加载扩展后再试。"
        });
        return;
      }

      if (!response?.ok) {
        const error = normalizeUiError(response?.error);
        if (error.code !== "JOB_CANCELLED") showClientError(error);
      }
    }
  );
}

function retryAnalysis() {
  clearResult();
  errorSection.hidden = true;

  if (selectedImages.length) {
    startUploadAnalysis();
    return;
  }

  if (lastJob?.source && lastJob.source !== "本地上传图片") {
    setBusy(true);
    chrome.runtime.sendMessage(
      {
        type: "startAnalysis",
        sourceUrl: lastJob.source,
        sourceType: "retry",
        promptStyle: promptStyle.value,
        promptContext: getPromptContext()
      },
      (response) => {
        setBusy(false);
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError || !response?.ok) {
          const error = normalizeUiError(response?.error || runtimeError);
          if (error.code !== "JOB_CANCELLED") showClientError(error);
        }
      }
    );
    return;
  }

  showClientError({
    code: "NO_RETRY_SOURCE",
    message: "没有可重试的图片。",
    suggestion: "请重新上传图片，或在网页图片上右键生成。"
  });
}

function stopActiveJob() {
  const jobId = currentJobId || lastJob?.id;
  if (!jobId || lastJob?.status !== "loading") {
    showClientError({
      code: "NO_ACTIVE_JOB",
      message: "当前没有正在运行的生成任务。",
      suggestion: "上传图片并开始生成后，才能结束进程。"
    });
    return;
  }

  stopButton.disabled = true;
  chrome.runtime.sendMessage({ type: "cancelAnalysis", jobId }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError || !response?.ok) {
      showClientError(normalizeUiError(response?.error || runtimeError));
    }
  });
}

async function openPinnedPanel() {
  if (surface === "panel") {
    setStatus({
      title: "已固定在侧边栏",
      detail: "当前界面会保持打开，不会因切换网页而关闭。",
      meta: statusMeta.textContent,
      state: "success"
    });
    return;
  }

  try {
    if (!chrome.sidePanel?.open) throw new Error("当前 Chrome 不支持侧边栏 API。");
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    setStatus({
      title: "已打开固定界面",
      detail: "侧边栏会持续显示进度和结果。",
      meta: "可以关闭这个弹窗继续操作网页。",
      state: "success"
    });
  } catch (error) {
    chrome.runtime.sendMessage({ type: "openSidePanel" }, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError || !response?.ok) {
        showClientError({
          code: "SIDEPANEL_UNAVAILABLE",
          message: normalizeUiError(response?.error || runtimeError || error).message,
          suggestion: "请使用 Chrome 116 或更新版本，并重新加载扩展。"
        });
      }
    });
  }
}

function hydrateLastResult() {
  chrome.storage.local.get(LAST_RESULT_KEY, ({ imagePromptStudioLastResult }) => {
    renderStoredResult(imagePromptStudioLastResult);
  });
}

function renderStoredResult(job) {
  if (!job) return;

  lastJob = job;
  currentJobId = job.id || currentJobId;
  if (job.promptStyle && promptStyle.value !== job.promptStyle) {
    promptStyle.value = promptStyleHints[job.promptStyle] ? job.promptStyle : DEFAULT_PROMPT_STYLE;
    updatePromptStyleHint();
    updateMarketingContextVisibility();
  }

  setProgress(job.progress || 0);
  setStatus({
    title: job.title || statusTitle.textContent,
    detail: job.detail || "",
    meta: buildMeta(job),
    state: job.status
  });

  if (job.status === "loading") {
    setBusy(true);
    errorSection.hidden = true;
    resultSection.hidden = true;
    return;
  }

  setBusy(false);

  if (job.status === "cancelled") {
    errorSection.hidden = true;
    clearResult();
    return;
  }

  if (job.status === "error") {
    clearResult();
    showError(job.error || {
      code: "UNKNOWN_ERROR",
      message: job.message || "生成失败。",
      suggestion: job.detail || "请稍后重试。"
    });
    return;
  }

  if (job.status === "success" && job.result) {
    errorSection.hidden = true;
    showResult(job.result);
  }
}

function renderPreviewGrid() {
  previewGrid.textContent = "";
  selectedImages.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    const img = document.createElement("img");
    img.src = image.previewUrl;
    img.alt = image.name || `图片 ${index + 1}`;

    const badge = document.createElement("span");
    badge.className = "preview-badge";
    badge.textContent = String(index + 1);

    const removeButton = document.createElement("button");
    removeButton.className = "preview-remove";
    removeButton.type = "button";
    removeButton.title = "移除这张图片";
    removeButton.setAttribute("aria-label", `移除第 ${index + 1} 张图片`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => removeSelectedImage(index));

    item.append(img, badge, removeButton);
    previewGrid.append(item);
  });

  previewSection.hidden = selectedImages.length === 0;
  setBusy(false);
}

function removeSelectedImage(index) {
  selectedImages = selectedImages.filter((_, imageIndex) => imageIndex !== index);
  renderPreviewGrid();
  clearResult();
  errorSection.hidden = true;
  setProgress(0);

  if (!selectedImages.length) {
    setStatus({
      title: "准备就绪",
      detail: "请添加 1 到 6 张图片后生成 Prompt。",
      meta: "",
      state: "idle"
    });
    return;
  }

  setStatus({
    title: `已选择 ${selectedImages.length} 张图片`,
    detail: "可以继续添加或生成 Prompt。",
    meta: selectedImages.map(formatImageMeta).join("；"),
    state: "idle"
  });
}

function showResult(text) {
  resultText.value = text;
  resultSection.hidden = false;
}

function clearResult() {
  resultText.value = "";
  resultSection.hidden = true;
}

function showClientError(error) {
  setBusy(false);
  setProgress(100);
  clearResult();
  setStatus({
    title: "操作失败",
    detail: error.message,
    meta: error.code,
    state: "error"
  });
  showError(error);
}

function showError(error) {
  const normalized = normalizeUiError(error);
  errorCode.textContent = normalized.code;
  errorMessage.textContent = normalized.message;
  errorSuggestion.textContent = normalized.suggestion;
  errorSection.hidden = false;
}

function setStatus({ title, detail, meta, state }) {
  statusTitle.textContent = title;
  statusText.textContent = detail;
  statusMeta.textContent = meta || "";
  statusBox.classList.toggle("loading", state === "loading");
  statusBox.classList.toggle("error", state === "error");
  statusBox.classList.toggle("success", state === "success");
  statusBox.classList.toggle("cancelled", state === "cancelled");
}

function setProgress(value) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  progressValue.textContent = `${Math.round(progress)}%`;
  progressBar.style.width = `${progress}%`;
}

function setBusy(isBusy) {
  analyzeButton.disabled = isBusy || !selectedImages.length;
  analyzeButton.textContent = isBusy ? "生成中..." : "生成提示词";
  retryButton.disabled = isBusy;
  stopButton.disabled = !isBusy;
  promptStyle.disabled = isBusy;
  targetMarket.disabled = isBusy;
  sellingPoints.disabled = isBusy;
}

function buildMeta(job) {
  const source = job.sourceType === "upload" ? "本地上传" : "网页图片";
  const elapsed = formatElapsed(job.startedAt, job.finishedAt);
  return [source, job.promptStyleLabel, elapsed].filter(Boolean).join(" · ");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}

async function optimizeImageFile(file) {
  const originalDataUrl = await readFileAsDataUrl(file);
  const original = parseDataUrl(originalDataUrl);

  if (file.type === "image/gif" || file.type === "image/heic" || file.type === "image/heif") {
    return { ...original, previewUrl: originalDataUrl, size: file.size, optimized: false };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await canvasToBlob(canvas, OPTIMIZED_IMAGE_TYPE, OPTIMIZED_IMAGE_QUALITY);
    if (!blob || blob.size >= file.size) {
      return { ...original, previewUrl: originalDataUrl, size: file.size, optimized: false };
    }

    const optimizedDataUrl = await readFileAsDataUrl(blob);
    return { ...parseDataUrl(optimizedDataUrl), previewUrl: optimizedDataUrl, size: blob.size, optimized: true };
  } catch {
    return { ...original, previewUrl: originalDataUrl, size: file.size, optimized: false };
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function getImageFilesFromClipboard(clipboardData) {
  const files = Array.from(clipboardData?.files || []);
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  if (imageFiles.length) return imageFiles;

  const items = Array.from(clipboardData?.items || []);
  return items
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
}

function isEditableTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;
}

function flashDropZone(className) {
  dropZone.classList.add(className);
  setTimeout(() => dropZone.classList.remove(className), 900);
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error("图片格式无效。");
  return { mimeType: match[1], data: match[2] };
}

async function loadPromptStyle() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  promptStyle.value = promptStyleHints[settings.promptStyle] ? settings.promptStyle : DEFAULT_PROMPT_STYLE;
  updatePromptStyleHint();
  updateMarketingContextVisibility();
}

async function savePromptStyle() {
  updatePromptStyleHint();
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  await chrome.storage.local.set({
    [SETTINGS_KEY]: {
      ...settings,
      promptStyle: promptStyle.value
    }
  });
}

function updatePromptStyleHint() {
  promptStyleHint.textContent = promptStyleHints[promptStyle.value] || promptStyleHints[DEFAULT_PROMPT_STYLE];
}

function updateMarketingContextVisibility() {
  marketingContext.hidden = promptStyle.value !== "localizedMarketing";
}

function getPromptContext() {
  if (promptStyle.value !== "localizedMarketing") return {};
  return {
    targetMarket: targetMarket.value.trim(),
    sellingPoints: sellingPoints.value.trim()
  };
}

function normalizeUiError(error) {
  if (error?.code && error?.message) {
    return {
      code: error.code,
      message: error.message,
      suggestion: error.suggestion || "请稍后重试。"
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: error?.message || String(error || "未知错误"),
    suggestion: "请稍后重试。如果问题持续出现，可以重新加载扩展。"
  };
}

function formatElapsed(startedAt, finishedAt) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "";
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return `用时 ${seconds}s`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatImageMeta(image) {
  const size = image.optimized && image.originalSize
    ? `${formatBytes(image.originalSize)} -> ${formatBytes(image.size)}`
    : formatBytes(image.size);
  return [image.name, size].filter(Boolean).join(" · ");
}
