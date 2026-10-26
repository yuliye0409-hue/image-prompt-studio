const MENU_ID = "image-prompt-studio-analyze";
const DEFAULT_PROVIDER = "openaiCompatible";
const DEFAULT_MODEL = "gpt-5.5";
const DEFAULT_BASE_URL = "https://ai.gs88.shop";
const SETTINGS_KEY = "imagePromptStudioSettings";
const LAST_RESULT_KEY = "imagePromptStudioLastResult";

const DEFAULT_SETTINGS = {
  provider: DEFAULT_PROVIDER,
  apiKey: "",
  baseUrl: DEFAULT_BASE_URL,
  model: DEFAULT_MODEL,
  reasoningEffort: "medium",
  promptStyle: "universal"
};

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
  "image/tiff"
]);

const MAX_IMAGES = 6;

const PROMPT_STYLE_LABELS = {
  universal: "通用图生文 Prompt",
  productAppearance: "产品外观分析 Prompt",
  localizedMarketing: "本地化营销排版 Prompt"
};

const activeJobs = new Map();

enableActionSidePanel();

chrome.runtime.onInstalled.addListener(() => {
  enableActionSidePanel();
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "生成图生文提示词",
    contexts: ["image"]
  });
});

chrome.runtime.onStartup?.addListener(() => {
  enableActionSidePanel();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;
  await openSidePanelForTab(tab);
  runAnalysisJob({ sourceUrl: info.srcUrl, sourceType: "contextMenu" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "openSettings") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === "startAnalysis") {
    runAnalysisJob({
      images: message.images,
      image: message.image,
      sourceUrl: message.sourceUrl,
      sourceType: message.sourceType || "upload",
      promptStyle: message.promptStyle,
      promptContext: message.promptContext
    })
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "cancelAnalysis") {
    cancelAnalysis(message.jobId)
      .then((job) => sendResponse({ ok: true, job }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "openSidePanel") {
    openSidePanelForSender(sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  if (message?.type === "getSettings") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
    return true;
  }

  return false;
});

async function runAnalysisJob({ images, image, sourceUrl, sourceType, promptStyle, promptContext }) {
  const runningJob = Array.from(activeJobs.values()).find((entry) => entry.job?.status === "loading");
  if (runningJob) {
    throw createAppError(
      "JOB_ALREADY_RUNNING",
      "已有生成任务正在运行。",
      "请等待当前任务完成，或点击“结束进程”后再开始新的任务。"
    );
  }

  const startedAt = new Date().toISOString();
  const controller = new AbortController();
  const selectedPromptStyle = normalizePromptStyle(promptStyle);
  const job = {
    id: createJobId(),
    status: "loading",
    phase: "queued",
    progress: 4,
    source: sourceUrl || "本地上传图片",
    sourceType,
    promptStyle: selectedPromptStyle,
    promptStyleLabel: PROMPT_STYLE_LABELS[selectedPromptStyle],
    title: "准备生成 Prompt",
    detail: "任务已创建，正在准备图片。",
    startedAt,
    updatedAt: startedAt
  };

  await saveJob(job);
  activeJobs.set(job.id, { controller, job });

  try {
    let inputImages = normalizeImages(images || image);

    if (!inputImages.length && sourceUrl) {
      await updateJob(job, {
        phase: "reading",
        progress: 14,
        title: "读取网页图片",
        detail: "正在从当前网页读取图片内容。"
      });
      inputImages = [await fetchImageAsDataUrl(sourceUrl, controller.signal)];
    }

    await updateJob(job, {
      phase: "validating",
      progress: 26,
      title: "校验图片",
      detail: "正在确认图片格式是否支持。"
    });
    validateImages(inputImages);

    await updateJob(job, {
      phase: "settings",
      progress: 36,
      title: "读取设置",
      detail: "正在读取 API 服务商、密钥和模型配置。"
    });
    const settings = await getSettings();
    settings.promptStyle = normalizePromptStyle(promptStyle || settings.promptStyle);
    settings.promptContext = normalizePromptContext(promptContext);
    job.promptStyle = settings.promptStyle;
    job.promptStyleLabel = PROMPT_STYLE_LABELS[settings.promptStyle];

    if (!settings.apiKey) {
      throw createAppError(
        "MISSING_API_KEY",
        "请先在扩展设置中填写 API Key。",
        "打开设置页，选择服务商并粘贴对应的 API Key。"
      );
    }

    const result = await requestModel(inputImages, settings, (stage) => updateJob(job, stage), controller.signal);

    await updateJob(job, {
      status: "success",
      phase: "done",
      progress: 100,
      title: "生成完成",
      detail: "中文和英文 Prompt 已生成，可以复制使用。",
      result,
      finishedAt: new Date().toISOString()
    });

    return result;
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === "JOB_CANCELLED" || controller.signal.aborted) {
      await updateJob(job, {
        status: "cancelled",
        phase: "cancelled",
        progress: 100,
        title: "已结束进程",
        detail: "生成任务已手动结束。",
        message: "任务已取消。",
        error: normalized,
        finishedAt: new Date().toISOString()
      });
    } else {
      await updateJob(job, {
        status: "error",
        phase: "failed",
        progress: 100,
        title: "生成失败",
        detail: normalized.suggestion,
        message: normalized.message,
        error: normalized,
        finishedAt: new Date().toISOString()
      });
    }
    throw normalized;
  } finally {
    activeJobs.delete(job.id);
  }
}

async function requestModel(images, settings, onProgress, signal) {
  if (settings.provider === "openaiCompatible") {
    return requestOpenAIResponses(images, settings, onProgress, signal);
  }
  return requestGemini(images, settings, onProgress, signal);
}

async function requestOpenAIResponses(images, settings, onProgress, signal) {
  const endpoints = buildResponsesEndpoints(settings.baseUrl);
  let requestBody = buildOpenAIRequestBody(images, settings, { recoveryMode: false });
  let recoveryMode = false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await onProgress({
      phase: attempt === 0 ? "requesting" : "retrying",
      progress: attempt === 0 ? 52 : Math.min(76, 58 + attempt * 8),
      title: attempt === 0 ? "提交到 OpenAI 兼容接口" : recoveryMode ? "补救空响应" : "等待并发限制释放",
      detail: attempt === 0
        ? `正在使用「${PROMPT_STYLE_LABELS[settings.promptStyle]}」规则。`
        : recoveryMode
        ? "上一次响应没有最终文本，正在使用更直接的输出指令重试。"
        : `服务商提示当前账号并发受限，正在自动重试第 ${attempt + 1} 次。`
    });

    let response;
    let endpoint;

    for (const candidateEndpoint of endpoints) {
      endpoint = candidateEndpoint;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${settings.apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream, text/plain"
          },
          body: requestBody,
          signal
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw createAppError("JOB_CANCELLED", "生成任务已结束。", "你已手动结束当前进程。");
        }
        throw createAppError(
          "NETWORK_ERROR",
          "无法连接 OpenAI 兼容接口。",
          `请检查网络、代理或 Base URL 是否可访问：${settings.baseUrl}`,
          { cause: error }
        );
      }

      if (response.status !== 404 || candidateEndpoint === endpoints.at(-1)) break;
    }

    await onProgress({
      phase: "receiving",
      progress: 78,
      title: "等待模型返回",
      detail: "模型正在识别图片并生成 Prompt。"
    });

    const rawBody = await response.text();
    const payload = parseCompatibleResponse(rawBody);

    if (!response.ok) {
      const apiMessage = getCompatibleApiMessage(payload, rawBody, response.status);
      if (shouldRetryCompatibleError(response.status, apiMessage) && attempt < 2) {
        const delayMs = getCompatibleRetryDelay(attempt);
        await onProgress({
          phase: "retrying",
          progress: Math.min(84, 62 + attempt * 10),
          title: "等待并发限制释放",
          detail: `接口返回“${apiMessage}”，${Math.round(delayMs / 1000)} 秒后自动重试。`
        });
        await waitForRetry(delayMs, signal);
        continue;
      }

      throw createAppError(
        "OPENAI_COMPATIBLE_API_ERROR",
        `OpenAI 兼容接口请求失败：${apiMessage}`,
        getOpenAISuggestion(response.status, apiMessage),
        { httpStatus: response.status, payload, endpoint }
      );
    }

    await onProgress({
      phase: "parsing",
      progress: 90,
      title: "整理结果",
      detail: "正在解析模型返回内容。"
    });

    const text = extractOpenAIText(payload);
    if (!text) {
      const responseSummary = summarizeResponseShape(payload, rawBody);
      if (!recoveryMode) {
        recoveryMode = true;
        requestBody = buildOpenAIRequestBody(images, settings, { recoveryMode: true });
        await onProgress({
          phase: "retrying",
          progress: 84,
          title: "补救空响应",
          detail: `接口已响应但没有文本字段（${responseSummary}），正在自动补救一次。`
        });
        await waitForRetry(1200, signal);
        continue;
      }

      return requestOpenAIChatCompletions(images, settings, onProgress, signal, responseSummary);
    }

    return text.trim();
  }

  throw createAppError(
    "OPENAI_COMPATIBLE_API_ERROR",
    "OpenAI 兼容接口请求失败：并发限制仍未释放。",
    "请稍后再试，或检查是否有其他页面/扩展正在使用同一个 API Key。"
  );
}

function buildOpenAIRequestBody(images, settings, { recoveryMode }) {
  const body = {
    model: settings.model,
    store: false,
    max_output_tokens: getMaxOutputTokens(settings.promptStyle, images.length, recoveryMode),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: recoveryMode
              ? buildRecoveryPrompt(settings.promptStyle, images.length, settings.promptContext)
              : buildPrompt(settings.promptStyle, images.length, settings.promptContext)
          },
          ...images.map((image) => ({
            type: "input_image",
            image_url: `data:${image.mimeType};base64,${image.data}`
          }))
        ]
      }
    ]
  };

  if (!recoveryMode) {
    body.reasoning = {
      effort: getReasoningEffort(settings.promptStyle)
    };
  }

  return JSON.stringify(body);
}

function buildRecoveryPrompt(promptStyle, imageCount = 1, context = {}) {
  return [
    "上一次接口响应没有返回最终文本。请不要输出 reasoning、JSON、状态字段、usage 或任何空内容。",
    "你必须直接输出最终可复制的 Prompt 文本，严格按下面任务要求完成。",
    buildPrompt(promptStyle, imageCount, context),
    "再次强调：只输出最终结果文本。中文 Prompt 和英文 Prompt 都必须完整出现。"
  ].join("\n\n");
}

async function requestOpenAIChatCompletions(images, settings, onProgress, signal, responseSummary) {
  await onProgress({
    phase: "retrying",
    progress: 86,
    title: "切换兼容模式",
    detail: `Responses API 没有返回文本（${responseSummary}），正在改用 Chat Completions 格式。`
  });

  const endpoints = buildChatCompletionEndpoints(settings.baseUrl);
  const requestBody = buildOpenAIChatRequestBody(images, settings);
  let response;
  let endpoint;

  for (const candidateEndpoint of endpoints) {
    endpoint = candidateEndpoint;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${settings.apiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain"
        },
        body: requestBody,
        signal
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw createAppError("JOB_CANCELLED", "生成任务已结束。", "你已手动结束当前进程。");
      }
      throw createAppError(
        "NETWORK_ERROR",
        "无法连接 Chat Completions 兼容接口。",
        `请检查网络、代理或 Base URL 是否可访问：${settings.baseUrl}`,
        { cause: error }
      );
    }

    if (response.status !== 404 || candidateEndpoint === endpoints.at(-1)) break;
  }

  await onProgress({
    phase: "parsing",
    progress: 92,
    title: "整理兼容模式结果",
    detail: "正在解析 Chat Completions 返回内容。"
  });

  const rawBody = await response.text();
  const payload = parseCompatibleResponse(rawBody);
  if (!response.ok) {
    const apiMessage = getCompatibleApiMessage(payload, rawBody, response.status);
    throw createAppError(
      "OPENAI_COMPATIBLE_API_ERROR",
      `Chat Completions 兼容请求失败：${apiMessage}`,
      getOpenAISuggestion(response.status, apiMessage),
      { httpStatus: response.status, payload, endpoint }
    );
  }

  const text = extractOpenAIText(payload);
  if (!text) {
    throw createAppError(
      "EMPTY_RESPONSE",
      "模型没有返回可用文本。",
      "Responses API 和 Chat Completions 兼容模式都没有返回文本。建议稍后重试，或在设置页更换 Base URL / 模型。"
    );
  }

  return text.trim();
}

function buildOpenAIChatRequestBody(images, settings) {
  return JSON.stringify({
    model: settings.model,
    temperature: 0.25,
    max_tokens: getMaxOutputTokens(settings.promptStyle, images.length, true),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildRecoveryPrompt(settings.promptStyle, images.length, settings.promptContext)
          },
          ...images.map((image) => ({
            type: "image_url",
            image_url: {
              url: `data:${image.mimeType};base64,${image.data}`
            }
          }))
        ]
      }
    ]
  });
}

async function requestGemini(images, settings, onProgress, signal) {
  await onProgress({
    phase: "requesting",
    progress: 52,
    title: "提交到 Gemini",
    detail: `正在使用「${PROMPT_STYLE_LABELS[settings.promptStyle]}」规则。`
  });

  let response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.apiKey
      },
      body: JSON.stringify({
        model: settings.model,
        store: false,
        input: [
          { type: "text", text: buildPrompt(settings.promptStyle, images.length, settings.promptContext) },
          ...images.map((image) => ({
            type: "image",
            data: image.data,
            mime_type: image.mimeType
          }))
        ],
        generation_config: {
          temperature: 0.35,
          thinking_level: "minimal",
          max_output_tokens: getMaxOutputTokens(settings.promptStyle, images.length)
        }
      }),
      signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw createAppError("JOB_CANCELLED", "生成任务已结束。", "你已手动结束当前进程。");
    }
    throw createAppError(
      "NETWORK_ERROR",
      "无法连接 Gemini API。",
      "请检查网络、代理或浏览器是否允许访问 generativelanguage.googleapis.com。",
      { cause: error }
    );
  }

  await onProgress({
    phase: "receiving",
    progress: 78,
    title: "等待模型返回",
    detail: "Gemini 正在识别图片并生成 Prompt。"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = payload?.error?.message || `HTTP ${response.status}`;
    throw createAppError(
      "GEMINI_API_ERROR",
      `Gemini API 请求失败：${apiMessage}`,
      getApiSuggestion(response.status, apiMessage),
      { httpStatus: response.status, payload }
    );
  }

  await onProgress({
    phase: "parsing",
    progress: 90,
    title: "整理结果",
    detail: "正在解析模型返回内容。"
  });

  const text = extractText(payload);
  if (!text) {
    throw createAppError("EMPTY_RESPONSE", "模型没有返回可用文本。", "可以换一张更清晰的图片，或稍后重试。");
  }
  return text.trim();
}

function buildPrompt(promptStyle, imageCount = 1, context = {}) {
  if (promptStyle === "productAppearance") return buildProductAppearancePrompt(imageCount);
  if (promptStyle === "localizedMarketing") return buildLocalizedMarketingPrompt(imageCount, context);
  return buildUniversalPrompt(imageCount);
}

function buildUniversalPrompt(imageCount = 1) {
  return [
    "你是一名专业的 AI 文生图提示词工程师。",
    imageCount > 1
      ? `请观察用户提供的 ${imageCount} 张图片，综合它们的主体、构图、风格和共性，把整组图片提炼成适用于市面主流 AI 图像生成模型的通用文生图 Prompt。`
      : "请观察用户提供的图片，把图片内容提炼成适用于市面主流 AI 图像生成模型的通用文生图 Prompt。",
    "提炼逻辑必须覆盖以下六个维度：",
    "1. 主体（产品）：主体或产品是什么，形态、材质、颜色、纹理、关键细节。",
    "2. 构图：画面比例、视角、景别、镜头距离、主体位置、层次关系、留白、景深。",
    "3. 背景环境：场景空间、道具、环境元素、时间感、氛围。",
    "4. 灯光色彩：主光源、光线方向、光质、阴影、高光、色调、配色关系。",
    "5. 视觉风格：摄影、商业广告、电影感、写实、插画、极简、未来感等整体风格和质量词。",
    "6. 画面留白预留区：判断适合后期人工排版使用的纯净空白/低干扰区域，包括上方、下方、左侧、右侧、中心或边角；只描述需要保留的干净空间、低细节背景、主体/产品避让关系和空间面积感，不要生成任何文案、标题、字体、按钮、Logo、占位文字或排版元素。",
    "请把六项信息浓缩成一段专业、自然、可直接复制的文生图提示词。",
    "留白预留区不要作为单独栏目输出，必须自然写进中文 Prompt 和英文 Prompt 中，例如：保留左侧大面积干净低干扰空白、顶部保持简洁背景、主体避开右侧空白区域、背景留出可后期处理的纯净负空间等。",
    "最终 Prompt 必须明确禁止模型生成任何文字或排版内容：no text, no typography, no captions, no slogans, no logo, no watermark, no UI buttons, no placeholder text。只保留空间，后期由用户自行添加文案。",
    "必须输出中文和英文两套 Prompt。英文 Prompt 要自然流畅，不要逐字硬翻译。",
    "不要输出详细推理过程、参数建议、反向提示词、文案内容、排版建议或额外的留白分析段。",
    "不要推断无法从图片确认的品牌、人物身份、版权角色、地点名称或敏感属性。",
    "输出格式：",
    "中文 Prompt：",
    "英文 Prompt："
  ].join("\n");
}

function buildProductAppearancePrompt(imageCount = 1) {
  return [
    "你是一名专业的产品外观与 AI 文生图提示词工程师。",
    imageCount > 1
      ? `请观察用户提供的 ${imageCount} 张图片，综合主要产品或同类产品的外观共性，生成中英文 Prompt。`
      : "请观察用户提供的图片，围绕产品外观本身生成中英文 Prompt。",
    "如果画面中有多个物体，请优先把最主要、最像商品或产品的对象作为分析对象。",
    "提炼逻辑只保留一个精炼字段组，总长度控制在约 80 个中文字符内：产品外观、形态、材质、纹理、结构细节。",
    "只提取最关键的产品外观关键词和短语，不写完整分析句，不展开场景、营销、灯光、参数或额外说明。",
    "中文 Prompt 和英文 Prompt 都要极简、聚焦产品外观，可直接复制用于文生图。",
    "不要单独输出分析过程、留白分析、参数建议或反向提示词。",
    "不要推断无法从图片确认的品牌、型号、人物身份、版权角色、地点名称或敏感属性。",
    "输出格式：",
    "中文 Prompt：",
    "英文 Prompt："
  ].join("\n");
}

function buildLocalizedMarketingPrompt(imageCount = 1, context = {}) {
  const targetMarket = context.targetMarket || "未提供，请根据产品视觉、语言环境和主流消费场景选择最合适的目标市场";
  const sellingPoints = context.sellingPoints || "未提供，请只基于图片中可见的产品特征提炼可营销卖点";

  return [
    "你是一位全球顶级的文案策划专家、本地化营销大师及顶尖视觉设计师。",
    "你的职责是：将产品卖点转化为符合目标市场语境的本土化文案，并基于平面设计原则，将文案融入视觉构图中，最终输出一套可直接用于文生图的专业 Prompt。",
    imageCount > 1
      ? `请观察用户提供的 ${imageCount} 张参考图，逐张分析产品主体、视觉风格、构图留白和可保留内容；必须为每张图分别输出独立 Prompt，不要合并成一条总 Prompt。`
      : "请观察用户提供的参考图，识别产品主体、视觉风格、构图留白和可保留内容。",
    `目标市场：${targetMarket}`,
    `产品/卖点：${sellingPoints}`,
    "工作原则：",
    "1. 策略化写作：拒绝翻译腔，注重文化语境映射，文案必须直击痛点并符合转化逻辑。",
    "2. 构图排版优先：文案植入必须遵循视觉层级、留白原则、黄金分割和阅读动线。",
    "3. Prompt 科学化：最终 Prompt 必须包含场景描述、光影色彩、文案位置预留、Layout Strategy 和商业质感描述。",
    "请务必 100% 遵守以下所有文案规则：",
    "1. 排版格式：主视觉文案必须严格保持“大标题 + 内容”的两行结构；原图已有的小字、标签、按钮、角标、说明文字、包装文字、免责声明等辅助文案也必须逐项本地化替换，但不计入主视觉两行结构。",
    "2. 字母大小写：大标题必须全部大写（ALL CAPS）；内容必须使用首字母大写（Title Case）。如果目标市场语言使用非拉丁文字，仍使用目标市场自然语言，并在出现拉丁字母时严格遵守大小写规则。",
    "3. 字符数限制：字符数包含空格与标点符号。大标题绝不能超过 25 个字符；内容必须严格控制在 35 - 40 个字符之间。",
    "4. 本地化要求：拒绝生硬机翻。在字数受限的情况下，优先保留核心卖点，使用目标市场最具冲击力和转化率的短句。",
    "5. 原图文字替换：如果参考图中已有标题、标语、按钮、小字、标签、角标、包装文字、说明文字或免责声明，最终 Prompt 必须要求把每张图中的全部可见文案都替换为目标市场语言文案，不要保留任何原语言文案；如果原图没有文字，则在最适合的留白区域新增主视觉两行文案。",
    "6. 多图统一排版系统：如果用户上传多张图片，必须先建立一套统一排版系统并应用到所有图片，包括主标题位置、内容行位置、字号层级、字重、字距、行距、对齐方式、边距、安全区、按钮/标签/小字位置、字体气质和颜色对比。所有图片必须看起来属于同一套广告系列，禁止每张图使用不同排版风格；只允许为避让主体、保证可读性和适配留白做轻微位置微调。",
    "7. 小字处理：所有小字必须翻译/重写为目标市场自然语言，并保持原本的小字号、低层级、按钮/标签/免责声明等功能属性；若小字太多导致画面拥挤，优先保留法律/产品/转化相关信息，压缩为目标市场可读短句。",
    "输出前必须自行校验两行文案的大小写和字符数；若不符合限制，必须重写到合规后再输出，不要展示校验过程。",
    "标准工作流：",
    "Step 1 文案本地化重构：针对目标市场为每张图输出 3 种文案版本，分别为痛点解决型、行动号召型、情感共鸣型；每个版本都必须满足两行结构、大小写和字符数限制。",
    "Step 2 排版视觉规划：多图时先输出统一排版系统，再基于每张原图构图给出轻微适配建议；必须包含统一位置规则、统一字体风格、统一字号层级、统一对齐方式、统一视觉引导方式、辅助小字替换策略。",
    "Step 3 Prompt 产出：提供可直接用于 generate_image 或其它 AI 绘画工具的最终 Prompt。",
    "Prompt 产出时，每张图只选择最适合画面和转化目标的一组两行文案作为最终植入内容，不要把 3 组文案同时放进同一张图。",
    "最终 Prompt 必须严格按这个结构写成一段自然可复制文本：[约束保留参考图内容不变，只修改/替换文案] + [所有图片共用同一套排版系统和字体气质] + [主视觉两行文案植入区域及内容] + [全部辅助小字/按钮/标签替换为目标市场语言] + [光影/艺术风格/商业质感]。",
    "中文 Prompt 和 English Prompt 都必须包含同一条最终选定的本地化文案；如果文案语言不是中文或英文，不要翻译文案本身，只翻译 Prompt 描述语言。",
    "视觉生成约束：保持原图主体、产品、构图关系和核心背景不变；多图必须统一排版风格和字体气质，只修改或植入目标市场语言文案；不要改变产品外观、材质、结构和核心背景。",
    "字体约束：避免指定市面上不能商用的具体英文字体名称，优先使用通用字体类别或可商用字体描述；多图必须共用同一套字体气质和字号层级。",
    "不要输出详细推理过程、反向提示词、参数建议或无法从图片确认的品牌、人物身份、版权角色、地点名称和敏感属性。",
    imageCount > 1
      ? "多图输出格式：先输出“统一排版系统：”，再按“图片 1：”“图片 2：”直到所有图片逐张输出；每张图都必须包含文案本地化重构、最终选定主文案、辅助小字替换、排版适配说明、中文 Prompt、English Prompt。"
      : "单图输出格式：必须包含文案本地化重构、最终选定主文案、辅助小字替换、排版视觉规划、中文 Prompt、English Prompt。",
    "输出格式：",
    imageCount > 1 ? "统一排版系统：" : "",
    imageCount > 1 ? "图片 1：" : "",
    "文案本地化重构：",
    "1. 痛点解决型：",
    "2. 行动号召型：",
    "3. 情感共鸣型：",
    "最终选定主文案：",
    "大标题：",
    "内容：",
    "辅助小字替换：",
    imageCount > 1 ? "排版适配说明：" : "排版视觉规划：",
    "位置：",
    "字体风格：",
    "视觉引导：",
    "中文 Prompt：",
    "English Prompt："
  ].join("\n");
}

async function fetchImageAsDataUrl(url, signal) {
  let response;
  try {
    response = await fetch(url, { credentials: "include", signal });
  } catch (error) {
    if (isAbortError(error)) throw createAppError("JOB_CANCELLED", "生成任务已结束。", "你已手动结束当前进程。");
    throw createAppError(
      "IMAGE_FETCH_ERROR",
      "无法读取网页图片。",
      "这个网站可能限制图片读取。可以先保存图片，再从扩展里上传。",
      { cause: error }
    );
  }

  if (!response.ok) {
    throw createAppError(
      "IMAGE_FETCH_ERROR",
      `无法读取图片：HTTP ${response.status}`,
      "这个网站可能限制图片读取。可以先保存图片，再从扩展里上传。"
    );
  }

  const blob = await response.blob();
  const dataUrl = await blobToDataUrl(blob);
  return parseDataUrl(dataUrl);
}

function normalizeImages(input) {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  return list.slice(0, MAX_IMAGES).map((item) => {
    if (typeof item === "string") return parseDataUrl(item);
    if (item?.dataUrl) return parseDataUrl(item.dataUrl);
    return {
      mimeType: item?.mimeType || item?.type || "image/png",
      data: item?.data || item?.base64 || ""
    };
  }).filter((item) => item.data);
}

function validateImages(images) {
  if (!images.length) {
    throw createAppError("NO_IMAGE", "没有可用图片。", "请上传、拖拽或粘贴至少一张图片。");
  }

  for (const image of images) {
    if (!SUPPORTED_IMAGE_TYPES.has(image.mimeType)) {
      throw createAppError(
        "UNSUPPORTED_IMAGE_TYPE",
        `暂不支持 ${image.mimeType} 图片。`,
        "请使用 PNG、JPG、WebP、HEIC、HEIF、GIF、BMP 或 TIFF。"
      );
    }
    if (!image.data || image.data.length < 16) {
      throw createAppError("INVALID_IMAGE", "图片内容无效。", "请换一张清晰可读取的图片。");
    }
  }
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw createAppError("INVALID_IMAGE", "图片格式无效。", "请重新上传图片。");
  return { mimeType: match[1], data: match[2] };
}

function blobToDataUrl(blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
  });
}

function extractText(payload) {
  return payload?.output_text ||
    payload?.text ||
    payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() ||
    payload?.choices?.[0]?.message?.content ||
    "";
}

function extractOpenAIText(payload) {
  return findTextIterative(payload);
}

function parseCompatibleResponse(rawBody) {
  const text = rawBody.trim();
  if (!text) return {};

  const json = parseJson(text);
  if (json) return json;

  if (text.startsWith("data:")) {
    const chunks = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");

    const collected = [];
    for (const chunk of chunks) {
      const chunkJson = parseJson(chunk);
      const chunkText = chunkJson ? extractOpenAIText(chunkJson) : chunk;
      if (chunkText) collected.push(chunkText);
    }
    return collected.join("\n").trim();
  }

  return text;
}

function getCompatibleApiMessage(payload, rawBody, status) {
  const candidates = typeof payload === "object" && payload
    ? [
        payload?.error?.message,
        payload?.message,
        payload?.title && payload?.detail ? `${payload.title}: ${payload.detail}` : "",
        payload?.title,
        payload?.detail
      ]
    : [typeof payload === "string" ? payload : ""];

  const message = candidates.filter(Boolean)[0] || rawBody || `HTTP ${status}`;
  return compactApiMessage(message);
}

function compactApiMessage(message) {
  const text = String(message || "").replace(/\s+/g, " ").trim();
  if (!text) return "未知 API 错误";
  if (
    text.includes("origin_response_timeout") ||
    text.includes("Error 524") ||
    (text.includes("524") && text.toLowerCase().includes("timeout"))
  ) {
    return "Cloudflare 524 超时：API 中转服务在 120 秒内没有等到上游模型完整响应。";
  }
  return text.length > 360 ? `${text.slice(0, 360)}...` : text;
}

function shouldRetryCompatibleError(status, message) {
  const text = String(message || "").toLowerCase();
  if (text.includes("quota") || text.includes("billing")) return false;
  return status === 409 ||
    status === 429 ||
    text.includes("concurrency limit") ||
    text.includes("too many concurrent") ||
    text.includes("rate limit") ||
    text.includes("please retry later");
}

function getCompatibleRetryDelay(attempt) {
  return [8000, 18000][attempt] || 30000;
}

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    let onAbort;
    const timeoutId = setTimeout(() => {
      if (onAbort) signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    onAbort = () => {
      clearTimeout(timeoutId);
      reject(createAppError("JOB_CANCELLED", "生成任务已结束。", "你已手动结束当前进程。"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findTextIterative(root) {
  if (typeof root === "string") return root.trim();
  if (!root || typeof root !== "object") return "";

  const textKeys = ["output_text", "text", "content", "message", "answer", "value"];
  const priorityKeys = ["output", "content", "choices", "message", "delta", "data", "result", "response"];
  const skipKeys = new Set(["input", "prompt", "image_url", "url", "b64_json", "usage", "metadata", "headers", "request", "body", "raw", "error"]);
  const queue = [{ value: root, depth: 0 }];
  const seen = new WeakSet();
  const fragments = [];
  let inspected = 0;

  while (queue.length && inspected < 5000) {
    inspected += 1;
    const { value, depth } = queue.shift();
    if (depth > 10 || value == null) continue;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && !looksLikeMetadata(trimmed)) fragments.push(trimmed);
      continue;
    }

    if (typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) queue.push({ value: item, depth: depth + 1 });
      continue;
    }

    for (const key of textKeys) {
      const child = value[key];
      if (typeof child === "string") {
        const trimmed = child.trim();
        if (trimmed && !looksLikeMetadata(trimmed)) fragments.push(trimmed);
      } else if (child && typeof child === "object") {
        queue.push({ value: child, depth: depth + 1 });
      }
    }

    for (const key of priorityKeys) {
      if (value[key] && !skipKeys.has(key)) queue.push({ value: value[key], depth: depth + 1 });
    }

    for (const [key, child] of Object.entries(value)) {
      if (skipKeys.has(key) || textKeys.includes(key) || priorityKeys.includes(key)) continue;
      if (child && typeof child === "object") queue.push({ value: child, depth: depth + 1 });
    }
  }

  return [...new Set(fragments)].join("\n").trim();
}

function looksLikeMetadata(text) {
  return /^(completed|in_progress|assistant|user|system|stop|reasoning)$/i.test(text) ||
    /^https?:\/\//i.test(text) ||
    text.length < 2;
}

function summarizeResponseShape(payload, rawBody) {
  if (typeof payload === "string") return `纯文本长度 ${payload.length}`;
  if (!payload || typeof payload !== "object") return `原始响应长度 ${rawBody.length}`;
  return Object.keys(payload).slice(0, 12).join(", ") || `原始响应长度 ${rawBody.length}`;
}

function buildResponsesEndpoints(baseUrl) {
  const base = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
  if (base.endsWith("/v1")) return [`${base}/responses`];
  if (base.endsWith("/responses")) return [base];
  return [`${base}/v1/responses`, `${base}/responses`];
}

function buildChatCompletionEndpoints(baseUrl) {
  const base = normalizeBaseUrl(baseUrl || DEFAULT_BASE_URL);
  if (base.endsWith("/chat/completions")) return [base];
  if (base.endsWith("/responses")) return [base.replace(/\/responses$/, "/chat/completions")];
  if (base.endsWith("/v1")) return [`${base}/chat/completions`];
  return [`${base}/v1/chat/completions`, `${base}/chat/completions`];
}

function getReasoningEffort(promptStyle) {
  return promptStyle === "localizedMarketing" ? "medium" : "low";
}

function getMaxOutputTokens(promptStyle, imageCount = 1, recoveryMode = false) {
  if (promptStyle === "productAppearance") return recoveryMode ? 900 : 450;
  if (promptStyle === "localizedMarketing") return recoveryMode
    ? Math.min(5200, 2400 + imageCount * 640)
    : Math.min(4200, 1600 + imageCount * 520);
  return recoveryMode ? Math.min(2600, 1800 + imageCount * 260) : Math.min(1600, 900 + imageCount * 180);
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

async function getSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const saved = stored[SETTINGS_KEY] || {};
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  settings.provider = normalizeProvider(settings.provider);
  settings.baseUrl = normalizeBaseUrl(settings.baseUrl || DEFAULT_BASE_URL);
  return settings;
}

async function saveJob(job) {
  await chrome.storage.local.set({ [LAST_RESULT_KEY]: job });
}

async function updateJob(job, patch) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  await saveJob(job);
}

async function cancelAnalysis(jobId) {
  const entry = jobId ? activeJobs.get(jobId) : Array.from(activeJobs.values()).at(-1);
  if (!entry) {
    throw createAppError(
      "NO_ACTIVE_JOB",
      "当前没有正在运行的生成任务。",
      "上传图片并开始生成后，才能结束进程。"
    );
  }

  entry.controller.abort();
  await updateJob(entry.job, {
    status: "cancelled",
    phase: "cancelled",
    progress: 100,
    title: "已结束进程",
    detail: "生成任务已手动结束。",
    message: "任务已取消。",
    error: createAppError("JOB_CANCELLED", "生成任务已结束。", "你已手动结束当前进程。"),
    finishedAt: new Date().toISOString()
  });
  return entry.job;
}

async function openSidePanelForTab(tab) {
  if (!chrome.sidePanel?.open || !tab?.windowId) return;
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch {
    // Some Chrome builds only allow side panel opening from extension pages.
  }
}

function enableActionSidePanel() {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
}

async function openSidePanelForSender(sender) {
  if (!chrome.sidePanel?.open) {
    throw createAppError("SIDEPANEL_UNAVAILABLE", "当前浏览器不支持固定侧边栏。", "请使用 Chrome 116 或更新版本。");
  }
  const windowId = sender?.tab?.windowId || chrome.windows.WINDOW_ID_CURRENT;
  await chrome.sidePanel.open({ windowId });
}

function createJobId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePromptStyle(promptStyle) {
  return PROMPT_STYLE_LABELS[promptStyle] ? promptStyle : "universal";
}

function normalizePromptContext(context) {
  if (!context || typeof context !== "object") return {};
  return {
    targetMarket: sanitizePromptContext(context.targetMarket),
    sellingPoints: sanitizePromptContext(context.sellingPoints)
  };
}

function sanitizePromptContext(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 600);
}

function normalizeProvider(provider) {
  return provider === "gemini" ? "gemini" : "openaiCompatible";
}

function createAppError(code, message, suggestion, extra = {}) {
  return { code, message, suggestion, ...extra };
}

function normalizeError(error) {
  if (error?.code && error?.message) {
    return {
      code: error.code,
      message: error.message,
      suggestion: error.suggestion || "请稍后重试。",
      httpStatus: error.httpStatus
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message,
      suggestion: "请稍后重试。如果问题持续出现，可以重新加载扩展。"
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: String(error || "未知错误"),
    suggestion: "请稍后重试。"
  };
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "JOB_CANCELLED";
}

function getOpenAISuggestion(status, message) {
  const text = message.toLowerCase();
  if (text.includes("concurrency limit") || text.includes("too many concurrent")) {
    return "当前账号并发请求数超限。请等待上一条请求释放后再试；插件已限制本地同时只跑一个任务，并会自动等待后重试。";
  }
  if (status === 524 || text.includes("cloudflare 524") || text.includes("origin_response_timeout") || text.includes("timeout")) {
    return "这是 API 中转服务超时，不是图片或 Key 格式问题。请减少一次上传的图片数量、换更轻的模型或稍后重试；如果频繁出现，建议更换更稳定的 Base URL。";
  }
  if (status === 401 || status === 403 || text.includes("api key") || text.includes("auth")) {
    return "请检查 OpenAI 兼容接口的 API Key 是否正确，是否仍然可用。";
  }
  if (status === 404 || text.includes("model")) {
    return "请检查 Base URL 和模型名是否正确，例如 https://ai.gs88.shop 与 gpt-5.5。";
  }
  if (status === 429 || text.includes("quota") || text.includes("rate")) {
    return "当前接口额度或速率限制已触发，请稍后再试或检查服务商账户余额。";
  }
  if (status >= 500) return "接口服务暂时不可用，请稍后重试。";
  return "请检查 API Key、Base URL、模型名，以及该接口是否支持 Responses API 和图片输入。";
}

function getApiSuggestion(status, message) {
  const text = message.toLowerCase();
  if (status === 401 || status === 403 || text.includes("api key")) {
    return "请检查 Gemini API Key 是否正确、是否已启用 Gemini API 权限。";
  }
  if (status === 404 || text.includes("model")) {
    return "请检查设置页里的模型名是否正确，或换成支持图像输入的 Gemini 模型。";
  }
  if (status === 429) return "请求频率或额度可能超限，请稍后再试。";
  if (status >= 500) return "Gemini 服务暂时不可用，请稍后重试。";
  return "请检查图片、模型名和 API Key 后重试。";
}
