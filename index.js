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
  textStart: "（",
  textEnd: "）",
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [],
  availableModels: []
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

    // 过滤出TTS相关模型
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

  // 添加默认选项
  modelSelect.append('<optgroup label="默认模型">');
  modelSelect.append('<option value="FunAudioLLM/CosyVoice2-0.5B">CosyVoice2-0.5B (默认)</option>');
  modelSelect.append('</optgroup>');

  // 添加API获取的模型
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

  // 恢复之前的选择
  if (currentValue && modelSelect.find(`option[value="${currentValue}"]`).length > 0) {
    modelSelect.val(currentValue);
  }

  // 保存获取到的模型到设置
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

      // 播放测试音频
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

  // 添加自定义音色
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

  // 恢复已保存的模型列表
  if (extension_settings[extensionName].availableModels && extension_settings[extensionName].availableModels.length > 0) {
    updateModelDropdown(extension_settings[extensionName].availableModels);
  }

  updateVoiceOptions();
}

// 更新音色选项
function updateVoiceOptions() {
  const model = $("#tts_model").val();
  const voiceSelect = $("#tts_voice");
  const currentValue = voiceSelect.val();
  voiceSelect.empty();

  // 添加预设音色
  if (TTS_MODELS[model] && TTS_MODELS[model].voices) {
    voiceSelect.append('<optgroup label="预设音色">');
    Object.entries(TTS_MODELS[model].voices).forEach(([value, name]) => {
      voiceSelect.append(`<option value="${value}">${name}</option>`);
    });
    voiceSelect.append('</optgroup>');
  } else {
    // 如果没有预设，添加默认音色
    voiceSelect.append('<optgroup label="默认音色">');
    voiceSelect.append('<option value="alex">Alex (男声)</option>');
    voiceSelect.append('<option value="anna">Anna (女声)</option>');
    voiceSelect.append('<option value="bella">Bella (女声)</option>');
    voiceSelect.append('<option value="benjamin">Benjamin (男声)</option>');
    voiceSelect.append('</optgroup>');
  }

  // 添加自定义音色
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

  // 恢复之前的选择或设置默认值
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

// TTS功能
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
  console.log('事件类型:', event_types);
  console.log('eventSource 对象:', eventSource);

  try {
    console.log('尝试监听所有消息相关事件...');

    if (event_types.MESSAGE_SENT) {
      eventSource.on(event_types.MESSAGE_SENT, () => {
        console.log('检测到MESSAGE_SENT事件');
      });
    }

    if (event_types.MESSAGE_RECEIVED) {
      eventSource.on(event_types.MESSAGE_RECEIVED, () => {
        console.log('检测到MESSAGE_RECEIVED事件');
      });
    }

    if (event_types.CHAT_CHANGED) {
      eventSource.on(event_types.CHAT_CHANGED, () => {
        console.log('检测到CHAT_CHANGED事件');
      });
    }
  } catch (error) {
    console.error('设置测试监听器出错:', error);
  }

  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    console.log('角色消息渲染:', messageId);

    if (audioState.lastProcessedMessageId === messageId) {
      console.log('消息已处理，跳过:', messageId);
      return;
    }

    console.log('新消息，准备处理:', messageId);

    const autoPlay = $("#auto_play_audio").prop("checked");
    if (!autoPlay) {
      console.log('自动朗读未开启');
      return;
    }

    if (audioState.processingTimeout) {
      clearTimeout(audioState.processingTimeout);
    }

    audioState.processingTimeout = setTimeout(() => {
      console.log('延时处理开始:', messageId);
      if (audioState.lastProcessedMessageId === messageId) {
        console.log('消息在延迟期间已被处理，跳过');
        return;
      }

      audioState.lastProcessedMessageId = messageId;
      console.log('处理消息:', messageId);
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      console.log('查找消息元素:', messageElement.length > 0 ? '找到' : '未找到');

      const message = messageElement.find('.mes_text').text();
      console.log('消息内容长度:', message ? message.length : 0);

      if (!message) {
        console.log('消息内容为空');
        return;
      }

      const textStart = $("#image_text_start").val();
      const textEnd = $("#image_text_end").val();

      console.log('检查标记:', { textStart, textEnd, 消息内容: message.substring(0, 100) });

      if (textStart && textEnd) {
        let extractedTexts = [];

        console.log('原始消息:', message);
        console.log('消息中的引号位置:');
        for (let i = 0; i < message.length; i++) {
          if (message[i] === '"' || message[i] === '"' || message[i] === '"' || message[i] === '"') {
            console.log(`位置${i}: "${message[i]}" (字符码: ${message[i].charCodeAt(0)})`);
          }
        }

        if (textStart === textEnd) {
          let insideQuote = false;
          let currentText = '';
          let pairCount = 0;

          for (let i = 0; i < message.length; i++) {
            const char = message[i];

            if (char === textStart) {
              if (!insideQuote) {
                console.log(`位置${i}: 开始第${pairCount + 1}对引号`);
                insideQuote = true;
                currentText = '';
              } else {
                console.log(`位置${i}: 结束第${pairCount + 1}对引号，内容: "${currentText}"`);
                if (currentText.trim()) {
                  extractedTexts.push(currentText.trim());
                  pairCount++;
                  console.log(`提取第${pairCount}对引号内容:`, currentText.trim());
                }
                insideQuote = false;
                currentText = '';
              }
            } else if (insideQuote) {
              currentText += char;
            }
          }
        } else {
          const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedStart = escapeRegex(textStart);
          const escapedEnd = escapeRegex(textEnd);

          const regex = new RegExp(`${escapedStart}(.*?)${escapedEnd}`, 'g');
          const matches = message.match(regex);

          if (matches && matches.length > 0) {
            console.log(`找到${matches.length}个标记内容`);

            matches.forEach(match => {
              const cleanText = match.replace(textStart, '').replace(textEnd, '').trim();
              if (cleanText) {
                extractedTexts.push(cleanText);
              }
            });
          }
        }

        if (extractedTexts.length > 0) {
          const finalText = extractedTexts.join(' ');
          console.log('自动朗读标记内文本:', finalText);
          generateTTS(finalText);
          return;
        }

        console.log('设置了标记但未找到匹配内容，跳过朗读');
      } else {
        console.log('未设置标记，自动朗读全文:', message.substring(0, 100));
        console.log('开始生成TTS...');
        generateTTS(message);
      }
    }, 1000);
  });

  eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
    console.log('用户消息渲染:', messageId);

    if (audioState.lastProcessedUserMessageId === messageId) {
      console.log('用户消息已处理，跳过:', messageId);
      return;
    }

    const autoPlayUser = $("#auto_play_user").prop("checked");
    if (!autoPlayUser) {
      console.log('用户消息自动朗读未开启');
      return;
    }
    console.log('用户消息自动朗读已开启');

    audioState.lastProcessedUserMessageId = messageId;

    setTimeout(() => {
      console.log('用户消息延时处理开始:', messageId);
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      console.log('用户消息元素:', messageElement.length > 0 ? '找到' : '未找到');

      const message = messageElement.find('.mes_text').text();
      console.log('用户消息内容长度:', message ? message.length : 0);
      if (!message) {
        console.log('用户消息内容为空');
        return;
      }

      const textStart = $("#image_text_start").val();
      const textEnd = $("#image_text_end").val();

      console.log('用户消息 - 检查标记:', { textStart, textEnd, 消息内容: message.substring(0, 100) });

      if (textStart && textEnd) {
        let extractedTexts = [];

        console.log('用户原始消息:', message);
        console.log('用户消息中的引号位置:');
        for (let i = 0; i < message.length; i++) {
          if (message[i] === '"' || message[i] === '"' || message[i] === '"' || message[i] === '"') {
            console.log(`位置${i}: "${message[i]}" (字符码: ${message[i].charCodeAt(0)})`);
          }
        }

        if (textStart === textEnd) {
          let insideQuote = false;
          let currentText = '';
          let pairCount = 0;

          for (let i = 0; i < message.length; i++) {
            const char = message[i];

            if (char === textStart) {
              if (!insideQuote) {
                console.log(`用户消息 - 位置${i}: 开始第${pairCount + 1}对引号`);
                insideQuote = true;
                currentText = '';
              } else {
                console.log(`用户消息 - 位置${i}: 结束第${pairCount + 1}对引号，内容: "${currentText}"`);
                if (currentText.trim()) {
                  extractedTexts.push(currentText.trim());
                  pairCount++;
                  console.log(`用户消息 - 提取第${pairCount}对引号内容:`, currentText.trim());
                }
                insideQuote = false;
                currentText = '';
              }
            } else if (insideQuote) {
              currentText += char;
            }
          }
        } else {
          const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const escapedStart = escapeRegex(textStart);
          const escapedEnd = escapeRegex(textEnd);

          const regex = new RegExp(`${escapedStart}(.*?)${escapedEnd}`, 'g');
          const matches = message.match(regex);

          if (matches && matches.length > 0) {
            console.log(`用户消息 - 找到${matches.length}个标记内容`);

            matches.forEach(match => {
              const cleanText = match.replace(textStart, '').replace(textEnd, '').trim();
              if (cleanText) {
                extractedTexts.push(cleanText);
              }
            });
          }
        }

        if (extractedTexts.length > 0) {
          const finalText = extractedTexts.join(' ');
          console.log('用户消息 - 自动朗读标记内文本:', finalText);
          generateTTS(finalText);
          return;
        }

        console.log('用户消息 - 设置了标记但未找到匹配内容，跳过朗读');
      } else {
        console.log('用户消息 - 未设置标记，自动朗读全文:', message.substring(0, 100));
        generateTTS(message);
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

          console.log("JSON上传失败，尝试FormData方式...");

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

  // 加载设置
  await loadSettings();

  // 加载自定义音色列表
  await loadCustomVoices();

  // 设置消息监听器
  setupMessageListener();

  console.log("硅基流动插件已加载");
  console.log("自动朗读功能已启用，请在控制台查看调试信息");
  console.log('事件源:', eventSource);
  console.log('事件类型:', event_types);
  console.log('角色消息事件:', event_types.CHARACTER_MESSAGE_RENDERED);
  console.log('用户消息事件:', event_types.USER_MESSAGE_RENDERED);
});

export { generateTTS };
