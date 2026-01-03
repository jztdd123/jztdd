import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展配置
const extensionName = "extension";
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
  cachedModels: [], // 新增：缓存的模型列表
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
  customVoices: [] 
};

// TTS模型和预设音色配置
// 注意：如果获取到的模型不在这个列表中，将不显示“预设音色”组，只显示“自定义音色”
const TTS_PRESETS = {
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

// 加载设置
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

  // UI 赋值
  $("#siliconflow_api_key").val(extension_settings[extensionName].apiKey || "");
  $("#siliconflow_api_url").val(extension_settings[extensionName].apiUrl || defaultSettings.apiUrl);
  
  // 恢复模型列表
  updateModelSelect(extension_settings[extensionName].cachedModels || []);
  
  // 设置选中的模型
  const savedModel = extension_settings[extensionName].ttsModel || defaultSettings.ttsModel;
  // 如果下拉框里没有这个模型（可能是还没获取，或者手动设置的），加进去
  if ($(`#tts_model option[value="${savedModel}"]`).length === 0) {
    $("#tts_model").append(new Option(savedModel, savedModel));
  }
  $("#tts_model").val(savedModel);

  $("#tts_voice").val(extension_settings[extensionName].ttsVoice || defaultSettings.ttsVoice);
  $("#tts_speed").val(extension_settings[extensionName].ttsSpeed || defaultSettings.ttsSpeed);
  $("#tts_speed_value").text(extension_settings[extensionName].ttsSpeed || defaultSettings.ttsSpeed);
  $("#tts_gain").val(extension_settings[extensionName].ttsGain || defaultSettings.ttsGain);
  $("#tts_gain_value").text(extension_settings[extensionName].ttsGain || defaultSettings.ttsGain);
  $("#image_text_start").val(extension_settings[extensionName].textStart || defaultSettings.textStart);
  $("#image_text_end").val(extension_settings[extensionName].textEnd || defaultSettings.textEnd);
  $("#auto_play_audio").prop("checked", extension_settings[extensionName].autoPlay !== false);
  $("#auto_play_user").prop("checked", extension_settings[extensionName].autoPlayUser === true);
  
  updateVoiceOptions();
}

// 辅助函数：更新模型下拉框
function updateModelSelect(models) {
    const $select = $("#tts_model");
    const currentVal = $select.val();
    
    // 保留当前选中的值，如果列表为空则不操作
    if (!models || models.length === 0) return;

    $select.empty();
    
    // 如果没有默认模型，添加一个
    let hasCosy = false;
    
    models.forEach(modelId => {
        $select.append(new Option(modelId, modelId));
        if (modelId === "FunAudioLLM/CosyVoice2-0.5B") hasCosy = true;
    });

    // 这是一个兜底，确保默认推荐模型在列表里
    if (!hasCosy && models.length === 0) {
        $select.append(new Option("FunAudioLLM/CosyVoice2-0.5B", "FunAudioLLM/CosyVoice2-0.5B"));
    }

    // 尝试恢复选中值，如果不在列表里，默认选第一个
    if (currentVal && models.includes(currentVal)) {
        $select.val(currentVal);
    } else if ($select.find('option').length > 0) {
        $select.val($select.find('option:first').val());
        // 触发变更事件以更新音色
        $select.trigger('change');
    }
}

// 获取远程模型列表
async function fetchRemoteModels() {
    const apiKey = $("#siliconflow_api_key").val();
    const apiUrl = $("#siliconflow_api_url").val();
    const $btn = $("#refresh_models");
    const $icon = $btn.find("i");

    if (!apiKey) {
        toastr.error("请先输入API密钥", "获取模型失败");
        return;
    }

    try {
        $icon.addClass("fa-spin"); // 添加旋转动画
        
        // 通常 OpenAI 兼容接口的模型端点是 /models
        // 注意：apiUrl 通常以 /v1 结尾，需要处理路径拼接
        let endpoint = apiUrl;
        if (endpoint.endsWith("/")) endpoint = endpoint.slice(0, -1);
        if (!endpoint.endsWith("/models")) {
             // 如果用户输入的是 .../v1，则拼成 .../v1/models
             endpoint = `${endpoint}/models`;
        }

        console.log(`正在从 ${endpoint} 获取模型列表...`);

        const response = await fetch(endpoint, {
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
        const modelList = data.data || data.models || []; // 兼容不同的返回格式
        
        if (modelList.length === 0) {
            toastr.warning("API返回了空模型列表", "获取模型");
            return;
        }

        // 提取模型 ID 并过滤 (可选：这里可以过滤只显示 audio 相关的，但有些 API 不返回 type)
        // 硅基流动的 API 返回所有模型，我们可以简单过滤或全部显示
        const modelIds = modelList.map(m => m.id).sort();
        
        console.log("获取到的模型:", modelIds);
        
        // 更新设置缓存
        extension_settings[extensionName].cachedModels = modelIds;
        saveSettingsDebounced();

        // 更新 UI
        updateModelSelect(modelIds);
        updateVoiceOptions(); // 模型变了，音色列表也可能需要变
        
        toastr.success(`成功获取 ${modelIds.length} 个模型`, "获取成功");

    } catch (error) {
        console.error("Fetch Models Error:", error);
        toastr.error(`获取模型失败: ${error.message}`, "错误");
    } finally {
        $icon.removeClass("fa-spin");
    }
}

// 更新音色选项
function updateVoiceOptions() {
  const model = $("#tts_model").val();
  const voiceSelect = $("#tts_voice");
  const currentValue = voiceSelect.val();
  voiceSelect.empty();
  
  // 1. 添加预设音色 (如果该模型有预设)
  // 检查是否有匹配的预设配置
  const presetConfig = TTS_PRESETS[model];
  
  if (presetConfig && presetConfig.voices) {
    voiceSelect.append('<optgroup label="预设音色">');
    Object.entries(presetConfig.voices).forEach(([value, name]) => {
      voiceSelect.append(`<option value="${value}">${name}</option>`);
    });
    voiceSelect.append('</optgroup>');
  } else {
    // 如果没有预设，可能是一个未知的模型或自定义接入的模型
    // 我们可以给一个默认的占位符，或者依赖自定义音色
    // 如果没有自定义音色，这里会是空的
  }
  
  // 2. 添加自定义音色 (始终显示)
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
  
  // 恢复之前的选择
  if (currentValue && voiceSelect.find(`option[value="${currentValue}"]`).length > 0) {
    voiceSelect.val(currentValue);
  } else {
    // 选第一个可用的
    voiceSelect.val(voiceSelect.find('option:first').val());
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
  extension_settings[extensionName].textStart = $("#image_text_start").val();
  extension_settings[extensionName].textEnd = $("#image_text_end").val();
  extension_settings[extensionName].autoPlay = $("#auto_play_audio").prop("checked");
  extension_settings[extensionName].autoPlayUser = $("#auto_play_user").prop("checked");
  
  saveSettingsDebounced();
  console.log("设置已保存");
}

// 测试连接 (实际上可以复用获取模型来验证连接)
async function testConnection() {
  const apiKey = $("#siliconflow_api_key").val();
  
  if (!apiKey) {
    toastr.error("请先输入API密钥", "连接失败");
    return;
  }
  
  try {
    $("#connection_status").text("连接中...").css("color", "orange");
    
    // 获取音色列表作为连接测试
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      $("#connection_status").text("已连接").css("color", "green");
      toastr.success("API连接成功", "系统消息");
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    toastr.error(`连接失败: ${error.message}`, "硅基流动插件");
    $("#connection_status").text("未连接").css("color", "red");
  }
}

// TTS功能 (生成逻辑需要确保使用动态配置的 API URL 和 Model)
async function generateTTS(text) {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl; // 使用配置的URL
  const model = $("#tts_model").val(); // 使用当前选中的模型

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
    console.log(`正在生成语音... 模型: ${model}`);
    
    const voiceValue = $("#tts_voice").val();
    const speed = parseFloat($("#tts_speed").val()) || 1.0;
    const gain = parseFloat($("#tts_gain").val()) || 0;
    
    if (!voiceValue) {
        toastr.warning("未选择语音角色", "TTS警告");
        return;
    }

    // 构造 voice 参数
    let voiceParam;
    if (voiceValue.startsWith("speech:") || voiceValue.includes("/")) {
      // 假设包含 / 或者是 uri 格式，直接使用
      voiceParam = voiceValue;
    } else {
      // 预设音色，使用 "模型:音色" 格式
      voiceParam = `${model}:${voiceValue}`;
    }
    
    const requestBody = {
      model: model, // 使用动态模型
      input: text,
      voice: voiceParam,
      response_format: "mp3",
      speed: speed,
      gain: gain
    };
    
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
      });
      audio.addEventListener('error', () => {
        audioState.isPlaying = false;
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
    audioState.isPlaying = false;
  }
}

// ... (setupMessageListener, uploadVoice, loadCustomVoices 等函数保持不变，注意里面的 API 调用要使用 settings 中的 apiUrl) ...

// jQuery加载时初始化 (更新部分)
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  // Inline drawer Toggle
  setTimeout(() => {
    $('.siliconflow-extension-settings .inline-drawer-toggle').each(function() {
      $(this).off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const $header = $(this);
        const $icon = $header.find('.inline-drawer-icon');
        const $content = $header.next('.inline-drawer-content');
        if ($content.data('open')) {
          $content.data('open', false); $content.hide(); $icon.removeClass('down');
        } else {
          $content.data('open', true); $content.show(); $icon.addClass('down');
        }
      });
    });
  }, 100);
  
  // 绑定事件
  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#test_siliconflow_connection").on("click", testConnection);
  
  // 新增：刷新模型列表按钮
  $("#refresh_models").on("click", fetchRemoteModels);
  
  // API URL 变更时更新设置对象（虽然保存按钮也会做，但为了即时性）
  $("#siliconflow_api_url").on("change", function() {
      extension_settings[extensionName].apiUrl = $(this).val();
  });

  $("#tts_model").on("change", function() {
      extension_settings[extensionName].ttsModel = $(this).val();
      updateVoiceOptions(); // 切换模型时更新可用音色
  });
  
  // ... 其他事件绑定保持不变 ...
  
  $("#test_tts").on("click", async function() {
    extension_settings[extensionName].ttsVoice = $("#tts_voice").val();
    const testText = $("#tts_test_text").val() || "你好，这是一个测试语音。";
    await generateTTS(testText);
  });
  
  // 初始化
  await loadSettings();
  await loadCustomVoices(); // 仍然加载自定义音色
  setupMessageListener();
  
  console.log("硅基流动扩展: 初始化完成");
});

export { generateTTS };
