import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展配置
const extensionName = "jztdd";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 全局状态管理
const audioState = {
  isPlaying: false,
  lastProcessedMessageId: null,
  lastProcessedUserMessageId: null,
  processingTimeout: null,
  audioQueue: []
};

// 默认设置
const defaultSettings = {
  apiKey: "",
  apiUrl: "https://api.siliconflow.cn/v1",
  ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
  ttsVoice: "alex",
  ttsSpeed: 1.0,
  ttsGain: 0,
  responseFormat: "mp3",
  sampleRate: 32000,
  imageModel: "",
  imageSize: "512",
  textStart: "",
  textEnd: "",
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [],
  availableModels: [],
  // 新增：正则屏蔽规则
  excludePatterns: [],
  // 预设的屏蔽规则
  presetExcludes: {
    think: "",
    thinking: "<thinking>[\\s\\S]*?",</thinking>
    analysis: "<analysis>[\\s\\S]*?</analysis>",
    note: "<note>[\\s\\S]*?</note>",
    cot: "<!--[\\s\\S]*?-->",</!--[\\s\\S]*?-->
    system: "<system>[\\s\\S]*?</system>"
  }
};

// TTS模型和音色配置
const TTS_MODELS = {
  "FunAudioLLM/CosyVoice2-0.5B": {
    name: "CosyVoice2-0.5B",
    voices: {
      "alex": "Alex (男声)",
      "anna": "Anna (女声)",
      "bella": "Bella (女声)",
      "benjamin": "Benjamin (男声)",
      "charles": "Charles (男声)",
      "claire": "Claire (女声)",
      "david": "David (男声)",
      "diana": "Diana (女声)"
    }
  }
};

// 从API获取可用模型
async function fetchAvailableModels() {
  const apiKey = $("#siliconflow_api_key").val();
  const apiUrl = $("#siliconflow_api_url").val();

  if (!apiKey) {
    toastr.error("请先输入API密钥", "获取模型失败");
    return;
  }

  try {
    $("#fetch_models_btn").prop("disabled", true).html('<i class="fa-solid fa-spinner fa-spin"></i> 获取中...');

    const response = await fetch(`${apiUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log("获取到的模型列表:", data);

    const allModels = data.data || data.results || data.models || [];
    const ttsModels = allModels.filter(model => {
      const modelId = (model.id || model.name || "").toLowerCase();
      return modelId.includes("tts") ||
             modelId.includes("voice") ||
             modelId.includes("audio") ||
             modelId.includes("cosy") ||
             modelId.includes("speech");
    });

    updateModelDropdown(ttsModels);
    toastr.success(`成功获取 ${ttsModels.length} 个TTS模型`, "获取模型");

  } catch (error) {
    console.error("Fetch Models Error:", error);
    toastr.error(`获取模型失败: ${error.message}`, "错误");
  } finally {
    $("#fetch_models_btn").prop("disabled", false).html('<i class="fa-solid fa-refresh"></i> 获取模型');
  }
}

// 更新模型下拉列表
function updateModelDropdown(models) {
  const modelSelect = $("#tts_model");
  const currentValue = modelSelect.val();

  modelSelect.empty();

  modelSelect.append('<optgroup label="默认模型">');
  modelSelect.append('<option value="FunAudioLLM/CosyVoice2-0.5B">CosyVoice2-0.5B (默认)</option>');
  modelSelect.append('</optgroup>');

  if (models && models.length > 0) {
    modelSelect.append('<optgroup label="API获取的模型">');
    models.forEach(model => {
      const modelId = model.id || model.name;
      const modelName = model.name || model.id;
      if (modelId !== "FunAudioLLM/CosyVoice2-0.5B") {
        modelSelect.append(`<option value="${modelId}">${modelName}</option>`);
      }
    });
    modelSelect.append('</optgroup>');
  }

  if (currentValue && modelSelect.find(`option[value="${currentValue}"]`).length > 0) {
    modelSelect.val(currentValue);
  }

  extension_settings[extensionName].availableModels = models;
  saveSettingsDebounced();
}

// 测试当前选择的模型
async function testCurrentModel() {
  const apiKey = $("#siliconflow_api_key").val();
  const apiUrl = $("#siliconflow_api_url").val();
  const model = $("#tts_model").val();

  if (!apiKey) {
    toastr.error("请先输入API密钥", "测试失败");
    return;
  }

  try {
    $("#test_model_btn").prop("disabled", true).html('<i class="fa-solid fa-spinner fa-spin"></i> 测试中...');
    $("#model_test_status").text("测试中...").css("color", "orange");

    const testText = "模型测试成功";
    const voiceValue = $("#tts_voice").val() || "alex";

    let voiceParam;
    if (voiceValue.startsWith("speech:")) {
      voiceParam = voiceValue;
    } else {
      voiceParam = `${model}:${voiceValue}`;
    }

    const response = await fetch(`${apiUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        input: testText,
        voice: voiceParam,
        response_format: "mp3"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const audioBlob = await response.blob();
    if (audioBlob.size > 0) {
      $("#model_test_status").text("✓ 模型可用").css("color", "green");
      toastr.success(`模型 "${model}" 测试成功！`, "模型测试");

      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play().catch(err => console.log("自动播放被阻止:", err));
    } else {
      throw new Error("返回的音频为空");
    }

  } catch (error) {
    console.error("Model Test Error:", error);
    $("#model_test_status").text("✗ 测试失败").css("color", "red");
    toastr.error(`模型测试失败: ${error.message}`, "测试失败");
  } finally {
    $("#test_model_btn").prop("disabled", false).html('<i class="fa-solid fa-flask"></i> 测试模型');
  }
}

// 获取模型支持的音色
async function fetchModelVoices() {
  const apiKey = $("#siliconflow_api_key").val();
  const apiUrl = $("#siliconflow_api_url").val();
  const model = $("#tts_model").val();

  if (!apiKey) return;

  try {
    const response = await fetch(`${apiUrl}/models/${encodeURIComponent(model)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log("模型详情:", data);

      if (data.voices || data.supported_voices) {
        const voices = data.voices || data.supported_voices;
        updateVoiceOptionsFromAPI(voices);
      }
    }
  } catch (error) {
    console.log("获取模型音色列表失败，使用默认音色");
  }
}

// 从API响应更新音色选项
function updateVoiceOptionsFromAPI(voices) {
  const voiceSelect = $("#tts_voice");
  const currentValue = voiceSelect.val();

  voiceSelect.empty();

  if (Array.isArray(voices)) {
    voiceSelect.append('<optgroup label="模型支持的音色">');
    voices.forEach(voice => {
      const voiceId = voice.id || voice.name || voice;
      const voiceName = voice.displayName || voice.name || voice.id || voice;
      voiceSelect.append(`<option value="${voiceId}">${voiceName}</option>`);
    });
    voiceSelect.append('</optgroup>');
  }

  const customVoices = extension_settings[extensionName].customVoices || [];
  if (customVoices.length > 0) {
    voiceSelect.append('<optgroup label="自定义音色">');
    customVoices.forEach(voice => {
      const voiceName = voice.name || voice.customName || "未命名";
      const voiceUri = voice.uri || voice.id;
      voiceSelect.append(`<option value="${voiceUri}">${voiceName} (自定义)</option>`);
    });
    voiceSelect.append('</optgroup>');
  }

  if (currentValue && voiceSelect.find(`option[value="${currentValue}"]`).length > 0) {
    voiceSelect.val(currentValue);
  }
}

// 加载设置
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};

  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // 确保新字段存在
  if (!extension_settings[extensionName].excludePatterns) {
    extension_settings[extensionName].excludePatterns = [];
  }

  // 更新UI
  $("#siliconflow_api_key").val(extension_settings[extensionName].apiKey || "");
  $("#siliconflow_api_url").val(extension_settings[extensionName].apiUrl || defaultSettings.apiUrl);
  $("#tts_model").val(extension_settings[extensionName].ttsModel || defaultSettings.ttsModel);
  $("#tts_voice").val(extension_settings[extensionName].ttsVoice || defaultSettings.ttsVoice);
  $("#tts_speed").val(extension_settings[extensionName].ttsSpeed || defaultSettings.ttsSpeed);
  $("#tts_speed_value").text(extension_settings[extensionName].ttsSpeed || defaultSettings.ttsSpeed);
  $("#tts_gain").val(extension_settings[extensionName].ttsGain || defaultSettings.ttsGain);
  $("#tts_gain_value").text(extension_settings[extensionName].ttsGain || defaultSettings.ttsGain);
  $("#response_format").val(extension_settings[extensionName].responseFormat || defaultSettings.responseFormat);
  $("#sample_rate").val(extension_settings[extensionName].sampleRate || defaultSettings.sampleRate);
  $("#image_size").val(extension_settings[extensionName].imageSize || defaultSettings.imageSize);
  $("#image_text_start").val(extension_settings[extensionName].textStart || defaultSettings.textStart);
  $("#image_text_end").val(extension_settings[extensionName].textEnd || defaultSettings.textEnd);
  $("#generation_frequency").val(extension_settings[extensionName].generationFrequency || defaultSettings.generationFrequency);
  $("#auto_play_audio").prop("checked", extension_settings[extensionName].autoPlay !== false);
  $("#auto_play_user").prop("checked", extension_settings[extensionName].autoPlayUser === true);

  if (extension_settings[extensionName].availableModels && extension_settings[extensionName].availableModels.length > 0) {
    updateModelDropdown(extension_settings[extensionName].availableModels);
  }

  updateVoiceOptions();
  updateExcludePatternsList();
}

// 更新音色选项
function updateVoiceOptions() {
  const model = $("#tts_model").val();
  const voiceSelect = $("#tts_voice");
  const currentValue = voiceSelect.val();
  voiceSelect.empty();

  if (TTS_MODELS[model] && TTS_MODELS[model].voices) {
    voiceSelect.append('<optgroup label="预设音色">');
    Object.entries(TTS_MODELS[model].voices).forEach(([value, name]) => {
      voiceSelect.append(`<option value="${value}">${name}</option>`);
    });
    voiceSelect.append('</optgroup>');
  } else {
    voiceSelect.append('<optgroup label="默认音色">');
    voiceSelect.append('<option value="alex">Alex (男声)</option>');
    voiceSelect.append('<option value="anna">Anna (女声)</option>');
    voiceSelect.append('<option value="bella">Bella (女声)</option>');
    voiceSelect.append('<option value="benjamin">Benjamin (男声)</option>');
    voiceSelect.append('</optgroup>');
  }

  const customVoices = extension_settings[extensionName].customVoices || [];
  console.log(`更新音色选项，自定义音色数量: ${customVoices.length}`);

  if (customVoices.length > 0) {
    voiceSelect.append('<optgroup label="自定义音色">');
    customVoices.forEach(voice => {
      const voiceName = voice.name || voice.customName || voice.custom_name || "未命名";
      const voiceUri = voice.uri || voice.id || voice.voice_id;
      console.log(`添加自定义音色: ${voiceName} -> ${voiceUri}`);
      voiceSelect.append(`<option value="${voiceUri}">${voiceName} (自定义)</option>`);
    });
    voiceSelect.append('</optgroup>');
  }

  if (currentValue && voiceSelect.find(`option[value="${currentValue}"]`).length > 0) {
    voiceSelect.val(currentValue);
  } else {
    voiceSelect.val(extension_settings[extensionName].ttsVoice || Object.keys(TTS_MODELS[model]?.voices || {})[0] || "alex");
  }
}

// 保存设置
function saveSettings() {
  extension_settings[extensionName].apiKey = $("#siliconflow_api_key").val();
  extension_settings[extensionName].apiUrl = $("#siliconflow_api_url").val();
  extension_settings[extensionName].ttsModel = $("#tts_model").val();
  extension_settings[extensionName].ttsVoice = $("#tts_voice").val();
  extension_settings[extensionName].ttsSpeed = parseFloat($("#tts_speed").val());
  extension_settings[extensionName].ttsGain = parseFloat($("#tts_gain").val());
  extension_settings[extensionName].responseFormat = $("#response_format").val();
  extension_settings[extensionName].sampleRate = parseInt($("#sample_rate").val());
  extension_settings[extensionName].imageSize = $("#image_size").val();
  extension_settings[extensionName].textStart = $("#image_text_start").val();
  extension_settings[extensionName].textEnd = $("#image_text_end").val();
  extension_settings[extensionName].generationFrequency = parseInt($("#generation_frequency").val());
  extension_settings[extensionName].autoPlay = $("#auto_play_audio").prop("checked");
  extension_settings[extensionName].autoPlayUser = $("#auto_play_user").prop("checked");

  saveSettingsDebounced();
  console.log("设置已保存");
}

// 测试连接
async function testConnection() {
  const apiKey = $("#siliconflow_api_key").val();
  const apiUrl = $("#siliconflow_api_url").val();

  if (!apiKey) {
    toastr.error("请先输入API密钥", "连接失败");
    return;
  }

  try {
    $("#test_siliconflow_connection").prop("disabled", true).text("测试中...");

    const response = await fetch(`${apiUrl}/audio/voice/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      $("#connection_status").text("已连接").css("color", "green");
      toastr.success("API连接成功", "连接测试");
      console.log("API连接成功");
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    toastr.error(`连接失败: ${error.message}`, "硅基流动插件");
    $("#connection_status").text("未连接").css("color", "red");
  } finally {
    $("#test_siliconflow_connection").prop("disabled", false).text("测试连接");
  }
}

// ==================== 新增：文本处理函数 ====================

/**
 * 应用正则屏蔽规则，从文本中移除匹配的内容
 * @param {string} text - 原始文本
 * @returns {string} - 处理后的文本
 */
function applyExcludePatterns(text) {
  const patterns = extension_settings[extensionName].excludePatterns || [];

  if (patterns.length === 0) {
    return text;
  }

  let result = text;

  patterns.forEach(pattern => {
    try {
      const regex = new RegExp(pattern.regex, 'gi');
      const before = result;
      result = result.replace(regex, '');
      if (before !== result) {
        console.log(`正则屏蔽规则 "${pattern.name}" 已应用`);
      }
    } catch (e) {
      console.error(`正则表达式错误 (${pattern.name}):`, e);
    }
  });

  // 清理多余的空行
  result = result.replace(/\n{3,}/g, '\n\n').trim();

  return result;
}

/**
 * 从文本中提取标记内的内容（支持多组标记，用逗号分隔）
 * @param {string} text - 原始文本
 * @param {string} startMarkers - 开始标记（多个用逗号分隔）
 * @param {string} endMarkers - 结束标记（多个用逗号分隔）
 * @returns {string} - 提取的文本
 */
function extractMarkedText(text, startMarkers, endMarkers) {
  if (!startMarkers || !endMarkers) {
    return text;
  }

  // 分割多个标记
  const starts = startMarkers.split(',').map(s => s.trim()).filter(s => s);
  const ends = endMarkers.split(',').map(s => s.trim()).filter(s => s);

  // 如果数量不匹配，取最小数量
  const pairCount = Math.min(starts.length, ends.length);

  if (pairCount === 0) {
    return text;
  }

  let extractedTexts = [];

  for (let i = 0; i < pairCount; i++) {
    const textStart = starts[i];
    const textEnd = ends[i];

    console.log(`处理标记对 ${i + 1}: "${textStart}" ... "${textEnd}"`);

    if (textStart === textEnd) {
      // 相同标记：配对算法
      let insideQuote = false;
      let currentText = '';

      for (let j = 0; j < text.length; j++) {
        // 检查是否匹配标记（支持多字符标记）
        const matchStart = text.substring(j, j + textStart.length) === textStart;

        if (matchStart) {
          if (!insideQuote) {
            insideQuote = true;
            currentText = '';
            j += textStart.length - 1; // 跳过标记字符
          } else {
            if (currentText.trim()) {
              extractedTexts.push(currentText.trim());
            }
            insideQuote = false;
            currentText = '';
            j += textEnd.length - 1;
          }
        } else if (insideQuote) {
          currentText += text[j];
        }
      }
    } else {
      // 不同标记：使用正则表达式
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedStart = escapeRegex(textStart);
      const escapedEnd = escapeRegex(textEnd);

      const regex = new RegExp(`${escapedStart}([\\s\\S]*?)${escapedEnd}`, 'g');
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match[1] && match[1].trim()) {
          extractedTexts.push(match[1].trim());
        }
      }
    }
  }

  if (extractedTexts.length > 0) {
    return extractedTexts.join(' ');
  }

  // 没有找到匹配内容
  console.log('未找到标记匹配内容');
  return '';
}

/**
 * 完整的文本处理流程
 * @param {string} text - 原始文本
 * @returns {string} - 处理后的文本
 */
function processTextForTTS(text) {
  console.log('=== 开始文本处理 ===');
  console.log('原始文本长度:', text.length);

  // 步骤1：应用正则屏蔽规则
  let processedText = applyExcludePatterns(text);
  console.log('屏蔽后文本长度:', processedText.length);

  // 步骤2：提取标记内容
  const textStart = $("#image_text_start").val();
  const textEnd = $("#image_text_end").val();

  if (textStart && textEnd) {
    const extracted = extractMarkedText(processedText, textStart, textEnd);
    if (extracted) {
      processedText = extracted;
      console.log('提取后文本长度:', processedText.length);
    } else {
      console.log('标记提取无结果，跳过朗读');
      return '';
    }
  }

  console.log('=== 文本处理完成 ===');
  return processedText;
}

// ==================== 正则屏蔽规则管理 ====================

/**
 * 添加屏蔽规则
 */
function addExcludePattern(name, regex) {
  if (!name || !regex) {
    toastr.error("名称和正则表达式不能为空", "添加失败");
    return false;
  }

  // 验证正则表达式
  try {
    new RegExp(regex);
  } catch (e) {
    toastr.error(`正则表达式无效: ${e.message}`, "添加失败");
    return false;
  }

  const patterns = extension_settings[extensionName].excludePatterns || [];

  // 检查是否已存在
  if (patterns.some(p => p.name === name)) {
    toastr.warning("该规则名称已存在", "添加失败");
    return false;
  }

  patterns.push({ name, regex });
  extension_settings[extensionName].excludePatterns = patterns;
  saveSettingsDebounced();
  updateExcludePatternsList();

  console.log(`添加屏蔽规则: ${name}`);
  return true;
}

/**
 * 删除屏蔽规则
 */
function removeExcludePattern(name) {
  const patterns = extension_settings[extensionName].excludePatterns || [];
  extension_settings[extensionName].excludePatterns = patterns.filter(p => p.name !== name);
  saveSettingsDebounced();
  updateExcludePatternsList();
  console.log(`删除屏蔽规则: ${name}`);
}

/**
 * 更新屏蔽规则列表UI
 */
function updateExcludePatternsList() {
  const patterns = extension_settings[extensionName].excludePatterns || [];
  const listContainer = $("#exclude_patterns_list");

  if (patterns.length === 0) {
    listContainer.html('<small style="color: var(--sf-text-secondary);">暂无屏蔽规则，点击上方预设按钮快速添加</small>');
    return;
  }

  let html = '';
  patterns.forEach(pattern => {
    html += `
      <div class="exclude-pattern-item" style="margin: 5px 0; padding: 10px 12px; background: rgba(0,0,0,0.2); border: 1px solid var(--sf-glass-border); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1; overflow: hidden;">
          <span style="font-weight: 500; color: var(--sf-text-primary);">${pattern.name}</span>
          <br/></br>
          <small style="color: var(--sf-text-secondary); font-family: monospace; font-size: 0.75em; word-break: break-all;">${escapeHtml(pattern.regex)}</small>
        </div>
        <button class="menu_button delete-pattern" data-name="${escapeHtml(pattern.name)}" style="padding: 4px 10px; font-size: 0.75em; margin-left: 10px;">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
  });

  listContainer.html(html);
}

/**
 * HTML转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== TTS功能 ====================

async function generateTTS(text) {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl || defaultSettings.apiUrl;

  if (!apiKey) {
    toastr.error("请先配置API密钥", "TTS错误");
    return;
  }

  if (!text) {
    toastr.error("文本不能为空", "TTS错误");
    return;
  }

  if (audioState.isPlaying) {
    console.log('音频正在处理中，跳过此次请求');
    return;
  }

  try {
    console.log("正在生成语音...");

    const model = $("#tts_model").val() || extension_settings[extensionName].ttsModel || defaultSettings.ttsModel;
    const voiceValue = $("#tts_voice").val() || "alex";
    const speed = parseFloat($("#tts_speed").val()) || 1.0;
    const gain = parseFloat($("#tts_gain").val()) || 0;

    let voiceParam;
    if (voiceValue.startsWith("speech:")) {
      voiceParam = voiceValue;
    } else {
      voiceParam = `${model}:${voiceValue}`;
    }

    const requestBody = {
      model: model,
      input: text,
      voice: voiceParam,
      response_format: "mp3",
      speed: speed,
      gain: gain
    };
    console.log('TTS请求参数:', {
      模型: model,
      音色: voiceParam,
      语速: speed,
      音量: gain,
      文本: text.substring(0, 50) + '...'
    });

    const response = await fetch(`${apiUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(audioUrl);

    if (extension_settings[extensionName].autoPlay) {
      audioState.isPlaying = true;

      audio.addEventListener('ended', () => {
        audioState.isPlaying = false;
        console.log('音频播放完成');
      });

      audio.addEventListener('error', () => {
        audioState.isPlaying = false;
        console.log('音频播放错误');
      });

      audio.play().catch(err => {
        audioState.isPlaying = false;
        console.error('播放失败:', err);
      });
    }

    const downloadLink = $(`<a href="${audioUrl}" download="tts_output.${extension_settings[extensionName].responseFormat}">下载音频</a>`);
    $("#tts_output").empty().append(downloadLink);

    console.log("语音生成成功！");

    return audioUrl;
  } catch (error) {
    console.error("TTS Error:", error);
    toastr.error(`语音生成失败: ${error.message}`, "TTS错误");
  }
}

// 监听消息事件，自动提取文本并生成语音
function setupMessageListener() {
  console.log('设置消息监听器');

  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    console.log('角色消息渲染:', messageId);

    if (audioState.lastProcessedMessageId === messageId) {
      console.log('消息已处理，跳过:', messageId);
      return;
    }

    const autoPlay = $("#auto_play_audio").prop("checked");
    if (!autoPlay) {
      console.log('自动朗读未开启');
      return;
    }

    if (audioState.processingTimeout) {
      clearTimeout(audioState.processingTimeout);
    }

    audioState.processingTimeout = setTimeout(() => {
      if (audioState.lastProcessedMessageId === messageId) {
        return;
      }

      audioState.lastProcessedMessageId = messageId;

      const messageElement = $(`.mes[mesid="${messageId}"]`);
      const message = messageElement.find('.mes_text').text();

      if (!message) {
        console.log('消息内容为空');
        return;
      }

      // 使用新的文本处理流程
      const processedText = processTextForTTS(message);

      if (processedText) {
        console.log('处理后文本:', processedText.substring(0, 100) + '...');
        generateTTS(processedText);
      } else {
        console.log('处理后无有效文本，跳过朗读');
      }
    }, 1000);
  });

  eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
    console.log('用户消息渲染:', messageId);

    if (audioState.lastProcessedUserMessageId === messageId) {
      return;
    }

    const autoPlayUser = $("#auto_play_user").prop("checked");
    if (!autoPlayUser) {
      return;
    }

    audioState.lastProcessedUserMessageId = messageId;

    setTimeout(() => {
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      const message = messageElement.find('.mes_text').text();

      if (!message) {
        return;
      }

      // 使用新的文本处理流程
      const processedText = processTextForTTS(message);

      if (processedText) {
        generateTTS(processedText);
      }
    }, 500);
  });
}

// 克隆音色功能
async function uploadVoice() {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl || defaultSettings.apiUrl;
  const voiceName = $("#clone_voice_name").val();
  const voiceText = $("#clone_voice_text").val();
  const audioFile = $("#clone_voice_audio")[0].files[0];

  if (!apiKey) {
    toastr.error("请先配置API密钥", "克隆音色错误");
    return;
  }

  if (!voiceName || !voiceText || !audioFile) {
    toastr.error("请填写音色名称、参考文本并选择音频文件", "克隆音色错误");
    return;
  }

  const namePattern = /^[a-zA-Z0-9_-]+$/;
  if (!namePattern.test(voiceName)) {
    toastr.error("音色名称只能包含英文字母、数字、下划线和连字符", "格式错误");
    return;
  }

  if (voiceName.length > 64) {
    toastr.error("音色名称不能超过64个字符", "格式错误");
    return;
  }

  try {
    console.log("开始上传音色...");
    $("#upload_voice").prop("disabled", true).text("上传中...");

    const reader = new FileReader();

    reader.onload = async function(e) {
      try {
        const base64Audio = e.target.result;

        const requestBody = {
          model: 'FunAudioLLM/CosyVoice2-0.5B',
          customName: voiceName,
          text: voiceText,
          audio: base64Audio
        };

        const response = await fetch(`${apiUrl}/uploads/audio/voice`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Upload error response:", errorText);

          const formData = new FormData();
          formData.append('model', 'FunAudioLLM/CosyVoice2-0.5B');
          formData.append('customName', voiceName);
          formData.append('text', voiceText);

          const base64Data = base64Audio.split(',')[1];
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], {type: audioFile.type});

          formData.append('audio', blob, audioFile.name);

          const response2 = await fetch(`${apiUrl}/uploads/audio/voice`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`
            },
            body: formData
          });

          if (!response2.ok) {
            throw new Error(`HTTP ${response2.status}: ${await response2.text()}`);
          }

          const data = await response2.json();
          console.log("音色上传成功(FormData):", data);
        } else {
          const data = await response.json();
          console.log("音色上传成功(JSON):", data);
        }

        $("#clone_voice_name").val("");
        $("#clone_voice_text").val("");
        $("#clone_voice_audio").val("");

        toastr.success(`音色 "${voiceName}" 克隆成功！`, "克隆音色");

        await loadCustomVoices();

      } catch (error) {
        console.error("Voice Clone Error:", error);
        toastr.error(`音色克隆失败: ${error.message}`, "克隆音色错误");
      } finally {
        $("#upload_voice").prop("disabled", false).text("上传克隆音色");
      }
    };

    reader.readAsDataURL(audioFile);

  } catch (error) {
    console.error("Voice Clone Error:", error);
    toastr.error(`音色克隆失败: ${error.message}`, "克隆音色错误");
    $("#upload_voice").prop("disabled", false).text("上传克隆音色");
  }
}

// 获取自定义音色列表
async function loadCustomVoices() {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl || defaultSettings.apiUrl;

  if (!apiKey) return;

  try {
    const response = await fetch(`${apiUrl}/audio/voice/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log("自定义音色列表:", data);

    extension_settings[extensionName].customVoices = data.result || data.results || [];

    if (extension_settings[extensionName].customVoices.length > 0) {
      console.log("第一个自定义音色结构:", extension_settings[extensionName].customVoices[0]);
    }

    updateCustomVoicesList();
    updateVoiceOptions();

  } catch (error) {
    console.error("Load Custom Voices Error:", error);
  }
}

// 更新自定义音色列表显示
function updateCustomVoicesList() {
  const customVoices = extension_settings[extensionName].customVoices || [];
  const listContainer = $("#custom_voices_list");

  if (customVoices.length === 0) {
    listContainer.html("<small>暂无自定义音色</small>");
    return;
  }

  let html = "";
  customVoices.forEach(voice => {
    const voiceName = voice.name || voice.customName || voice.custom_name || "未命名";
    const voiceUri = voice.uri || voice.id || voice.voice_id;
    html += `
      <div class="custom-voice-item" style="margin: 5px 0; padding: 5px; border: 1px solid #ddd; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>${voiceName}</span>
        <button class="menu_button delete-voice" data-uri="${voiceUri}" data-name="${voiceName}" style="padding: 2px 8px; font-size: 12px;">删除</button>
      </div>
    `;
  });

  listContainer.html(html);
}

// 删除自定义音色
async function deleteCustomVoice(uri, name) {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl || defaultSettings.apiUrl;

  if (!apiKey) {
    toastr.error("请先配置API密钥", "删除音色错误");
    return;
  }

  if (!confirm(`确定要删除音色 "${name}" 吗？`)) {
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/audio/voice/deletions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ uri: uri })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    toastr.success(`音色 "${name}" 已删除`, "删除成功");

    await loadCustomVoices();

  } catch (error) {
    console.error("Delete Voice Error:", error);
    toastr.error(`删除失败: ${error.message}`, "删除音色错误");
  }
}

// jQuery加载时初始化
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // Inline drawer 折叠/展开功能
  setTimeout(() => {
    $('.siliconflow-extension-settings .inline-drawer-toggle').each(function() {
      $(this).off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const $header = $(this);
        const $icon = $header.find('.inline-drawer-icon');
        const $content = $header.next('.inline-drawer-content');
        const isOpen = $content.data('open') === true;

        if (isOpen) {
          $content.data('open', false);
          $content.hide();
          $icon.removeClass('down');
        } else {
          $content.data('open', true);
          $content.show();
          $icon.addClass('down');
        }
      });
    });
  }, 100);

  // 绑定事件
  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#test_siliconflow_connection").on("click", testConnection);

  // 获取模型按钮
  $("#fetch_models_btn").on("click", fetchAvailableModels);

  // 测试模型按钮
  $("#test_model_btn").on("click", testCurrentModel);

  // 刷新音色按钮
  $("#refresh_voices_btn").on("click", function() {
    updateVoiceOptions();
    fetchModelVoices();
    loadCustomVoices();
  });

  // 模型切换时更新音色
  $("#tts_model").on("change", function() {
    extension_settings[extensionName].ttsModel = $(this).val();
    updateVoiceOptions();
    fetchModelVoices();
    saveSettingsDebounced();
  });

  // 音色切换
  $("#tts_voice").on("change", function() {
    extension_settings[extensionName].ttsVoice = $(this).val();
    console.log("选择的音色:", $(this).val());
    saveSettingsDebounced();
  });

  // API地址变更时自动保存
  $("#siliconflow_api_url").on("change", function() {
    extension_settings[extensionName].apiUrl = $(this).val();
    saveSettingsDebounced();
  });

  // 克隆音色功能事件
  $("#upload_voice").on("click", uploadVoice);
  $("#refresh_custom_voices").on("click", loadCustomVoices);

  // 删除音色事件（使用事件委托）
  $(document).on("click", ".delete-voice", function() {
    const uri = $(this).data("uri");
    const name = $(this).data("name");
    deleteCustomVoice(uri, name);
  });

  // 自动保存复选框状态
  $("#auto_play_audio").on("change", function() {
    extension_settings[extensionName].autoPlay = $(this).prop("checked");
    saveSettingsDebounced();
    console.log("自动朗读角色消息:", $(this).prop("checked"));
  });

  $("#auto_play_user").on("change", function() {
    extension_settings[extensionName].autoPlayUser = $(this).prop("checked");
    saveSettingsDebounced();
    console.log("自动朗读用户消息:", $(this).prop("checked"));
  });

  // 标记设置自动保存
  $("#image_text_start, #image_text_end").on("input", function() {
    extension_settings[extensionName].textStart = $("#image_text_start").val();
    extension_settings[extensionName].textEnd = $("#image_text_end").val();
    saveSettingsDebounced();
  });

  // 语速和音量滑块
  $("#tts_speed").on("input", function() {
    $("#tts_speed_value").text($(this).val());
    extension_settings[extensionName].ttsSpeed = parseFloat($(this).val());
    saveSettingsDebounced();
  });

  $("#tts_gain").on("input", function() {
    $("#tts_gain_value").text($(this).val());
    extension_settings[extensionName].ttsGain = parseFloat($(this).val());
    saveSettingsDebounced();
  });

  // TTS测试按钮
  $("#test_tts").on("click", async function() {
    extension_settings[extensionName].ttsVoice = $("#tts_voice").val();
    const testText = $("#tts_test_text").val() || "你好，这是一个测试语音。";
    await generateTTS(testText);
  });

  // ==================== 正则屏蔽规则事件 ====================

  // 添加自定义规则
  $("#add_exclude_pattern").on("click", function() {
    const name = $("#exclude_pattern_name").val().trim();
    const regex = $("#exclude_pattern_regex").val().trim();

    if (addExcludePattern(name, regex)) {
      $("#exclude_pattern_name").val("");
      $("#exclude_pattern_regex").val("");
      toastr.success(`规则 "${name}" 已添加`, "添加成功");
    }
  });

  // 预设规则按钮
  $("#preset_exclude_think").on("click", function() {
    addExcludePattern("think标签", "");
  });

  $("#preset_exclude_thinking").on("click", function() {
    addExcludePattern("thinking标签", "<thinking>[\\s\\S]*?");
  });

  $("#preset_exclude_cot").on("click", function() {</thinking>
    addExcludePattern("HTML注释(CoT)", "<!--[\\s\\S]*?-->");
  });

  $("#preset_exclude_analysis").on("click", function() {</!--[\\s\\S]*?-->
    addExcludePattern("analysis标签", "<analysis>[\\s\\S]*?</analysis>");
  });

  // 删除规则事件（使用事件委托）
  $(document).on("click", ".delete-pattern", function() {
    const name = $(this).data("name");
    removeExcludePattern(name);
    toastr.success(`规则 "${name}" 已删除`, "删除成功");
  });

  // 清空所有规则
  $("#clear_all_patterns").on("click", function() {
    if (confirm("确定要清空所有屏蔽规则吗？")) {
      extension_settings[extensionName].excludePatterns = [];
      saveSettingsDebounced();
      updateExcludePatternsList();
      toastr.success("所有规则已清空", "清空成功");
    }
  });

  // 加载设置
  await loadSettings();

  // 加载自定义音色列表
  await loadCustomVoices();

  // 设置消息监听器
  setupMessageListener();

  console.log("硅基流动插件已加载");
  console.log("自动朗读功能已启用，请在控制台查看调试信息");
});

export { generateTTS };
