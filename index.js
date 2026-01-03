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
  textStart: "「",
  textEnd: "」",
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [],
  availableModels: [],
  filterRules: [] // 新增：正则屏蔽规则
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

// ==================== 正则屏蔽功能 ====================

// 应用屏蔽规则过滤文本
function applyFilterRules(text) {
  const rules = extension_settings[extensionName].filterRules || [];
  let filteredText = text;

  rules.forEach(rule => {
    if (rule.enabled && rule.pattern) {
      try {
        const regex = new RegExp(rule.pattern, 'gi');
        filteredText = filteredText.replace(regex, '');
      } catch (e) {
        console.error(`正则规则 "${rule.name}" 无效:`, e);
      }
    }
  });

  // 清理多余空白
  filteredText = filteredText.replace(/\s+/g, ' ').trim();
  return filteredText;
}

// 添加屏蔽规则
function addFilterRule(name, pattern) {
  if (!name || !pattern) {
    toastr.error("请填写规则名称和正则表达式", "添加失败");
    return false;
  }

  // 验证正则表达式
  try {
    new RegExp(pattern);
  } catch (e) {
    toastr.error(`正则表达式无效: ${e.message}`, "添加失败");
    return false;
  }

  const rules = extension_settings[extensionName].filterRules || [];

  // 检查是否已存在
  if (rules.some(r => r.name === name)) {
    toastr.warning(`规则 "${name}" 已存在`, "添加失败");
    return false;
  }

  rules.push({
    name: name,
    pattern: pattern,
    enabled: true
  });

  extension_settings[extensionName].filterRules = rules;
  saveSettingsDebounced();
  updateFilterRulesList();
  toastr.success(`规则 "${name}" 已添加`, "添加成功");
  return true;
}

// 删除屏蔽规则
function removeFilterRule(name) {
  const rules = extension_settings[extensionName].filterRules || [];
  extension_settings[extensionName].filterRules = rules.filter(r => r.name !== name);
  saveSettingsDebounced();
  updateFilterRulesList();
}

// 切换规则启用状态
function toggleFilterRule(name) {
  const rules = extension_settings[extensionName].filterRules || [];
  const rule = rules.find(r => r.name === name);
  if (rule) {
    rule.enabled = !rule.enabled;
    saveSettingsDebounced();
    updateFilterRulesList();
  }
}

// 更新屏蔽规则列表UI
function updateFilterRulesList() {
  const rules = extension_settings[extensionName].filterRules || [];
  const container = $("#filter_rules_list");

  if (rules.length === 0) {
    container.html("<small>暂无屏蔽规则</small>");
    return;
  }

  let html = "";
  rules.forEach(rule => {
    const statusClass = rule.enabled ? "enabled" : "disabled";
    const statusIcon = rule.enabled ? "fa-toggle-on" : "fa-toggle-off";
    const statusColor = rule.enabled ? "#10b981" : "#6b7280";

    html += `
      <div class="filter-rule-item" style="display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
        <button class="menu_button toggle-rule-btn" data-name="${rule.name}" style="padding: 5px 10px; background: transparent !important; box-shadow: none !important;">
          <i class="fa-solid ${statusIcon}" style="color: ${statusColor}; font-size: 1.2em;"></i>
        </button>
        <div style="flex: 1; overflow: hidden;">
          <div style="font-weight: 600; color: ${rule.enabled ? '#fff' : '#888'};">${rule.name}</div>
          <div style="font-size: 0.8em; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${rule.pattern}">
            <code>${rule.pattern}</code>
          </div>
        </div>
        <button class="menu_button delete-rule-btn" data-name="${rule.name}" style="padding: 5px 10px; background: rgba(239,68,68,0.2) !important;">
          <i class="fa-solid fa-trash" style="color: #ef4444;"></i>
        </button>
      </div>
    `;
  });

  container.html(html);
}

// ==================== 多标记提取功能 ====================

// 解析多个标记（用逗号分隔）
function parseMarkers(markerString) {
  if (!markerString) return [];
  return markerString.split(',').map(m => m.trim()).filter(m => m.length > 0);
}

// 使用多组标记提取文本
function extractTextWithMultipleMarkers(message, startMarkers, endMarkers) {
  let extractedTexts = [];

  // 如果开始和结束标记数量不匹配，使用最小数量
  const pairCount = Math.min(startMarkers.length, endMarkers.length);

  for (let i = 0; i < pairCount; i++) {
    const startMark = startMarkers[i];
    const endMark = endMarkers[i];

    if (startMark === endMark) {
      // 相同标记的配对提取
      let insideQuote = false;
      let currentText = '';

      for (let j = 0; j < message.length; j++) {
        const char = message[j];

        if (char === startMark) {
          if (!insideQuote) {
            insideQuote = true;
            currentText = '';
          } else {
            if (currentText.trim()) {
              extractedTexts.push(currentText.trim());
            }
            insideQuote = false;
            currentText = '';
          }
        } else if (insideQuote) {
          currentText += char;
        }
      }
    } else {
      // 不同标记的正则提取
      const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedStart = escapeRegex(startMark);
      const escapedEnd = escapeRegex(endMark);

      const regex = new RegExp(`${escapedStart}([\\s\\S]*?)${escapedEnd}`, 'g');
      let match;

      while ((match = regex.exec(message)) !== null) {
        if (match[1] && match[1].trim()) {
          extractedTexts.push(match[1].trim());
        }
      }
    }
  }

  return extractedTexts;
}

// ==================== API功能 ====================

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

// ==================== 设置管理 ====================

async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};

  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // 确保filterRules存在
  if (!extension_settings[extensionName].filterRules) {
    extension_settings[extensionName].filterRules = [];
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
  $("#image_text_start").val(extension_settings[extensionName].textStart || defaultSettings.textStart);
  $("#image_text_end").val(extension_settings[extensionName].textEnd || defaultSettings.textEnd);
  $("#auto_play_audio").prop("checked", extension_settings[extensionName].autoPlay !== false);
  $("#auto_play_user").prop("checked", extension_settings[extensionName].autoPlayUser === true);

  if (extension_settings[extensionName].availableModels && extension_settings[extensionName].availableModels.length > 0) {
    updateModelDropdown(extension_settings[extensionName].availableModels);
  }

  updateVoiceOptions();
  updateFilterRulesList();
}

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
  if (customVoices.length > 0) {
    voiceSelect.append('<optgroup label="自定义音色">');
    customVoices.forEach(voice => {
      const voiceName = voice.name || voice.customName || voice.custom_name || "未命名";
      const voiceUri = voice.uri || voice.id || voice.voice_id;
      voiceSelect.append(`<option value="${voiceUri}">${voiceName} (自定义)</option>`);
    });
    voiceSelect.append('</optgroup>');
  }

  if (currentValue && voiceSelect.find(`option[value="${currentValue}"]`).length > 0) {
    voiceSelect.val(currentValue);
  } else {
    voiceSelect.val(extension_settings[extensionName].ttsVoice || "alex");
  }
}

function saveSettings() {
  extension_settings[extensionName].apiKey = $("#siliconflow_api_key").val();
  extension_settings[extensionName].apiUrl = $("#siliconflow_api_url").val();
  extension_settings[extensionName].ttsModel = $("#tts_model").val();
  extension_settings[extensionName].ttsVoice = $("#tts_voice").val();
  extension_settings[extensionName].ttsSpeed = parseFloat($("#tts_speed").val());
  extension_settings[extensionName].ttsGain = parseFloat($("#tts_gain").val());
  extension_settings[extensionName].textStart = $("#image_text_start").val();
  extension_settings[extensionName].textEnd = $("#image_text_end").val();
  extension_settings[extensionName].autoPlay = $("#auto_play_audio").prop("checked");
  extension_settings[extensionName].autoPlayUser = $("#auto_play_user").prop("checked");

  saveSettingsDebounced();
  console.log("设置已保存");
}

// ==================== 连接测试 ====================

async function testConnection() {
  const apiKey = $("#siliconflow_api_key").val();
  const apiUrl = $("#siliconflow_api_url").val();

  if (!apiKey) {
    toastr.error("请先输入API密钥", "连接失败");
    return;
  }

  try {
    $("#test_siliconflow_connection").prop("disabled", true).html('<i class="fa-solid fa-spinner fa-spin"></i> 测试中...');

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
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    toastr.error(`连接失败: ${error.message}`, "硅基流动插件");
    $("#connection_status").text("未连接").css("color", "red");
  } finally {
    $("#test_siliconflow_connection").prop("disabled", false).html('<i class="fa-solid fa-plug"></i> 测试连接');
  }
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

    const downloadLink = $(`<a href="${audioUrl}" download="tts_output.mp3">下载音频</a>`);
    $("#tts_output").empty().append(downloadLink);

    console.log("语音生成成功！");

    return audioUrl;
  } catch (error) {
    console.error("TTS Error:", error);
    toastr.error(`语音生成失败: ${error.message}`, "TTS错误");
  }
}

// ==================== 消息处理 ====================

function processMessageForTTS(message) {
  // 1. 先应用屏蔽规则
  let processedText = applyFilterRules(message);

  // 2. 再应用标记提取
  const textStartStr = $("#image_text_start").val();
  const textEndStr = $("#image_text_end").val();

  if (textStartStr && textEndStr) {
    const startMarkers = parseMarkers(textStartStr);
    const endMarkers = parseMarkers(textEndStr);

    if (startMarkers.length > 0 && endMarkers.length > 0) {
      const extractedTexts = extractTextWithMultipleMarkers(processedText, startMarkers, endMarkers);

      if (extractedTexts.length > 0) {
        return extractedTexts.join(' ');
      }

      // 有标记但没提取到内容，返回空
      console.log('设置了标记但未找到匹配内容');
      return null;
    }
  }

  // 没有设置标记，返回过滤后的全文
  return processedText;
}

function setupMessageListener() {
  console.log('设置消息监听器');

  // 角色消息监听
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    console.log('角色消息渲染:', messageId);

    if (audioState.lastProcessedMessageId === messageId) {
      return;
    }

    const autoPlay = $("#auto_play_audio").prop("checked");
    if (!autoPlay) {
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
        return;
      }

      const textToSpeak = processMessageForTTS(message);

      if (textToSpeak) {
        console.log('朗读文本:', textToSpeak.substring(0, 100));
        generateTTS(textToSpeak);
      }
    }, 1000);
  });

  // 用户消息监听
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

      const textToSpeak = processMessageForTTS(message);

      if (textToSpeak) {
        console.log('朗读用户消息:', textToSpeak.substring(0, 100));
        generateTTS(textToSpeak);
      }
    }, 500);
  });
}

// ==================== 克隆音色 ====================

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

  try {
    $("#upload_voice").prop("disabled", true).html('<i class="fa-solid fa-spinner fa-spin"></i> 上传中...');

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
          // 尝试FormData方式
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
        $("#upload_voice").prop("disabled", false).html('<i class="fa-solid fa-upload"></i> 上传克隆音色');
      }
    };

    reader.readAsDataURL(audioFile);

  } catch (error) {
    console.error("Voice Clone Error:", error);
    toastr.error(`音色克隆失败: ${error.message}`, "克隆音色错误");
    $("#upload_voice").prop("disabled", false).html('<i class="fa-solid fa-upload"></i> 上传克隆音色');
  }
}

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
    extension_settings[extensionName].customVoices = data.result || data.results || [];

    updateCustomVoicesList();
    updateVoiceOptions();

  } catch (error) {
    console.error("Load Custom Voices Error:", error);
  }
}

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
      <div class="custom-voice-item" style="display: flex; align-items: center; justify-content: space-between; padding: 10px; margin-bottom: 8px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
        <span style="display: flex; align-items: center; gap: 8px;">
          <i class="fa-solid fa-microphone" style="color: #a78bfa;"></i>
          ${voiceName}
        </span>
        <button class="menu_button delete-voice" data-uri="${voiceUri}" data-name="${voiceName}" style="padding: 5px 10px; background: rgba(239,68,68,0.2) !important;">
          <i class="fa-solid fa-trash" style="color: #ef4444;"></i>
        </button>
      </div>
    `;
  });

  listContainer.html(html);
}

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

// ==================== 初始化 ====================

jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);

  // 折叠面板事件
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

  // 基础事件绑定
  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#test_siliconflow_connection").on("click", testConnection);
  $("#fetch_models_btn").on("click", fetchAvailableModels);
  $("#test_model_btn").on("click", testCurrentModel);

  $("#refresh_voices_btn").on("click", function() {
    updateVoiceOptions();
    loadCustomVoices();
  });

  $("#tts_model").on("change", function() {
    extension_settings[extensionName].ttsModel = $(this).val();
    updateVoiceOptions();
    saveSettingsDebounced();
  });

  $("#tts_voice").on("change", function() {
    extension_settings[extensionName].ttsVoice = $(this).val();
    saveSettingsDebounced();
  });

  $("#siliconflow_api_url").on("change", function() {
    extension_settings[extensionName].apiUrl = $(this).val();
    saveSettingsDebounced();
  });

  // 克隆音色事件
  $("#upload_voice").on("click", uploadVoice);
  $("#refresh_custom_voices").on("click", loadCustomVoices);

  $(document).on("click", ".delete-voice", function() {
    const uri = $(this).data("uri");
    const name = $(this).data("name");
    deleteCustomVoice(uri, name);
  });

  // 自动朗读开关
  $("#auto_play_audio").on("change", function() {
    extension_settings[extensionName].autoPlay = $(this).prop("checked");
    saveSettingsDebounced();
  });

  $("#auto_play_user").on("change", function() {
    extension_settings[extensionName].autoPlayUser = $(this).prop("checked");
    saveSettingsDebounced();
  });

  // 标记设置
  $("#image_text_start, #image_text_end").on("input", function() {
    extension_settings[extensionName].textStart = $("#image_text_start").val();
    extension_settings[extensionName].textEnd = $("#image_text_end").val();
    saveSettingsDebounced();
  });

  // 滑块事件
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

  // TTS测试
  $("#test_tts").on("click", async function() {
    const testText = $("#tts_test_text").val() || "你好，这是一个测试语音。";
    await generateTTS(testText);
  });

  // ========== 正则屏蔽规则事件 ==========

  // 预设规则按钮
  $(document).on("click", ".preset-filter-btn", function() {
    const name = $(this).data("name");
    const pattern = $(this).data("pattern");
    addFilterRule(name, pattern);
  });

  // 添加自定义规则
  $("#add_filter_rule").on("click", function() {
    const name = $("#filter_rule_name").val().trim();
    const pattern = $("#filter_rule_pattern").val().trim();

    if (addFilterRule(name, pattern)) {
      $("#filter_rule_name").val("");
      $("#filter_rule_pattern").val("");
    }
  });

  // 切换规则状态
  $(document).on("click", ".toggle-rule-btn", function() {
    const name = $(this).data("name");
    toggleFilterRule(name);
  });

  // 删除规则
  $(document).on("click", ".delete-rule-btn", function() {
    const name = $(this).data("name");
    if (confirm(`确定要删除规则 "${name}" 吗？`)) {
      removeFilterRule(name);
    }
  });

  // 加载设置
  await loadSettings();
  await loadCustomVoices();
  setupMessageListener();

  console.log("硅基流动插件已加载 - 包含正则屏蔽和多标记提取功能");
});

export { generateTTS };
