import { extension_settings, getContext, loadExtensionSettings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

// 扩展配置
const extensionName = "jztdd"; // 必须与文件夹名称一致
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
  cachedModels: [], // 缓存的模型列表
  ttsVoice: "alex",
  ttsSpeed: 1.0,
  ttsGain: 0,
  responseFormat: "mp3",
  sampleRate: 32000,
  imageModel: "",
  imageSize: "512",
  textStart: "", // 默认为空，不开启截取
  textEnd: "",
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [] 
};

// 通用预设音色列表
const COMMON_VOICES = {
  "alex": "Alex (CosyVoice专用)",
  "anna": "Anna (CosyVoice专用)",
  "bella": "Bella (CosyVoice专用)",
  "benjamin": "Benjamin (CosyVoice专用)",
  "charles": "Charles (CosyVoice专用)",
  "claire": "Claire (CosyVoice专用)",
  "david": "David (CosyVoice专用)",
  "diana": "Diana (CosyVoice专用)"
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
  if ($(`#tts_model option[value="${savedModel}"]`).length === 0) {
    $("#tts_model").append(new Option(savedModel, savedModel));
  }
  $("#tts_model").val(savedModel);

  // 其他数值设置
  $("#tts_speed").val(extension_settings[extensionName].ttsSpeed || defaultSettings.ttsSpeed);
  $("#tts_speed_value").text(extension_settings[extensionName].ttsSpeed || defaultSettings.ttsSpeed);
  $("#tts_gain").val(extension_settings[extensionName].ttsGain || defaultSettings.ttsGain);
  $("#tts_gain_value").text(extension_settings[extensionName].ttsGain || defaultSettings.ttsGain);
  $("#image_text_start").val(extension_settings[extensionName].textStart || defaultSettings.textStart);
  $("#image_text_end").val(extension_settings[extensionName].textEnd || defaultSettings.textEnd);
  $("#auto_play_audio").prop("checked", extension_settings[extensionName].autoPlay !== false);
  $("#auto_play_user").prop("checked", extension_settings[extensionName].autoPlayUser === true);
  
  // 更新音色列表
  updateVoiceOptions(extension_settings[extensionName].ttsVoice || defaultSettings.ttsVoice);
}

// 辅助函数：更新模型下拉框
function updateModelSelect(models) {
    const $select = $("#tts_model");
    const currentVal = $select.val();
    
    if (!models || models.length === 0) return;

    $select.empty();
    
    let hasCosy = false;
    models.forEach(modelId => {
        $select.append(new Option(modelId, modelId));
        if (modelId === "FunAudioLLM/CosyVoice2-0.5B") hasCosy = true;
    });

    if (!hasCosy && models.length === 0) {
        $select.append(new Option("FunAudioLLM/CosyVoice2-0.5B", "FunAudioLLM/CosyVoice2-0.5B"));
    }

    if (currentVal && models.includes(currentVal)) {
        $select.val(currentVal);
    } else if ($select.find('option').length > 0) {
        $select.val($select.find('option:first').val());
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
        $icon.addClass("fa-spin");
        
        let endpoint = apiUrl;
        if (endpoint.endsWith("/")) endpoint = endpoint.slice(0, -1);
        if (!endpoint.endsWith("/models")) {
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
        const modelList = data.data || data.models || [];
        
        if (modelList.length === 0) {
            toastr.warning("API返回了空模型列表", "获取模型");
            return;
        }

        const modelIds = modelList.map(m => m.id).sort();
        
        extension_settings[extensionName].cachedModels = modelIds;
        saveSettingsDebounced();

        updateModelSelect(modelIds);
        toastr.success(`成功获取 ${modelIds.length} 个模型`, "获取成功");

    } catch (error) {
        console.error("Fetch Models Error:", error);
        toastr.error(`获取模型失败: ${error.message}`, "错误");
    } finally {
        $icon.removeClass("fa-spin");
    }
}

// 更新音色选项
function updateVoiceOptions(targetVoice = null) {
  const voiceSelect = $("#tts_voice");
  let voiceToSelect = targetVoice || voiceSelect.val() || extension_settings[extensionName].ttsVoice || "alex";
  
  voiceSelect.empty();
  
  // 添加通用预设音色
  voiceSelect.append('<optgroup label="预设音色 (仅限CosyVoice模型)">');
  Object.entries(COMMON_VOICES).forEach(([value, name]) => {
    voiceSelect.append(`<option value="${value}">${name}</option>`);
  });
  voiceSelect.append('</optgroup>');
  
  // 添加自定义音色
  const customVoices = extension_settings[extensionName].customVoices || [];
  if (customVoices.length > 0) {
    voiceSelect.append('<optgroup label="自定义音色 (适用于所有模型)">');
    customVoices.forEach(voice => {
      const voiceName = voice.name || voice.customName || voice.custom_name || "未命名";
      const voiceUri = voice.uri || voice.id || voice.voice_id;
      voiceSelect.append(`<option value="${voiceUri}">${voiceName} (自定义)</option>`);
    });
    voiceSelect.append('</optgroup>');
  }
  
  voiceSelect.val(voiceToSelect);
  if (!voiceSelect.val()) {
      voiceSelect.val("alex");
  }
  extension_settings[extensionName].ttsVoice = voiceSelect.val();
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

// 测试连接
async function testConnection() {
  const apiKey = $("#siliconflow_api_key").val();
  if (!apiKey) {
    toastr.error("请先输入API密钥", "连接失败");
    return;
  }
  try {
    $("#connection_status").text("连接中...").css("color", "orange");
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

// TTS生成功能
async function generateTTS(text) {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl;
  const model = $("#tts_model").val();

  if (!apiKey) {
    toastr.error("请先配置API密钥", "TTS错误");
    return;
  }
  if (!text || text.trim().length === 0) {
    console.log("TTS文本为空，跳过生成");
    return;
  }
  if (audioState.isPlaying) {
    console.log('音频正在处理中，跳过此次请求');
    return;
  }
  
  try {
    console.log(`正在生成语音... 模型: ${model}`);
    
    const voiceValue = $("#tts_voice").val() || "alex";
    const speed = parseFloat($("#tts_speed").val()) || 1.0;
    const gain = parseFloat($("#tts_gain").val()) || 0;
    
    let voiceParam;
    if (voiceValue.startsWith("speech:") || voiceValue.includes("/")) {
      voiceParam = voiceValue;
    } else if (model === "FunAudioLLM/CosyVoice2-0.5B") {
      voiceParam = `${model}:${voiceValue}`;
    } else {
      voiceParam = voiceValue;
    }
    
    const requestBody = {
      model: model,
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
      audio.addEventListener('ended', () => { audioState.isPlaying = false; });
      audio.addEventListener('error', () => { audioState.isPlaying = false; });
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

// 提取文本的辅助函数 (核心优化)
function extractTextWithMarkers(text, startMarkersStr, endMarkersStr) {
    if (!startMarkersStr || !endMarkersStr) return text;

    // 支持中文逗号和英文逗号分割
    const startArr = startMarkersStr.split(/[,，]/).map(s => s.trim()).filter(s => s);
    const endArr = endMarkersStr.split(/[,，]/).map(s => s.trim()).filter(s => s);

    if (startArr.length === 0 || endArr.length === 0) return text;

    let extractedParts = [];
    let hasMatch = false;

    // 转义正则特殊字符
    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 遍历每一对标记
    // 假设 text = "他说：“你好”，想了想(真奇怪)"
    // 标记1: “...” 标记2: (...)
    
    // 为了保持原本的语序，我们不能简单地先后运行正则，而是应该找到所有匹配项然后按位置排序
    // 但为了简单实现，我们可以把所有规则合并成一个大正则
    // 比如: (“(.*?)|”)|(\((.*?)\))
    
    // 构建所有对的正则片段
    const patterns = [];
    const minLen = Math.min(startArr.length, endArr.length);
    
    for (let i = 0; i < minLen; i++) {
        const s = escapeRegex(startArr[i]);
        const e = escapeRegex(endArr[i]);
        // 非贪婪匹配
        patterns.push(`${s}(.*?)${e}`);
    }
    
    if (patterns.length === 0) return text;

    // 组合正则
    const combinedRegex = new RegExp(patterns.join('|'), 'g');
    
    const matches = text.matchAll(combinedRegex);
    for (const match of matches) {
        hasMatch = true;
        // match[0] 是完整匹配 (如 “你好”)
        // 我们需要把标记去掉。
        // 因为这是一个组合正则，我们不确定是哪一组匹配到了，
        // 最简单的方法是用当前匹配到的完整字符串，去除对应的开始和结束标记
        
        let content = match[0];
        // 暴力去除匹配到的首尾标记
        // 找到是哪一组匹配的
        for (let i = 0; i < minLen; i++) {
             if (content.startsWith(startArr[i]) && content.endsWith(endArr[i])) {
                 // 去掉头部
                 content = content.substring(startArr[i].length);
                 // 去掉尾部
                 content = content.substring(0, content.length - endArr[i].length);
                 break;
             }
        }
        extractedParts.push(content.trim());
    }

    if (hasMatch && extractedParts.length > 0) {
        return extractedParts.join(' '); // 将提取出的片段用空格连接
    }

    // 如果设置了标记但没有找到任何匹配内容
    // 通常意味着这句话可能是旁白。
    // 如果没有提取到任何内容，我们默认读全文 (作为兜底)，或者根据需求可以改成不读。
    // 这里保持原逻辑：无匹配则读全文。如果想无匹配不读，可以返回 ""。
    return text; 
}

// 监听消息事件
function setupMessageListener() {
  // 角色消息
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    if (audioState.lastProcessedMessageId === messageId) return;
    if (!$("#auto_play_audio").prop("checked")) return;
    
    if (audioState.processingTimeout) clearTimeout(audioState.processingTimeout);
    
    audioState.processingTimeout = setTimeout(() => {
      if (audioState.lastProcessedMessageId === messageId) return;
      audioState.lastProcessedMessageId = messageId;
      
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      const message = messageElement.find('.mes_text').text();
      
      if (!message) return;
      
      const textStart = $("#image_text_start").val();
      const textEnd = $("#image_text_end").val();
      
      // 使用新的提取逻辑
      const textToRead = extractTextWithMarkers(message, textStart, textEnd);
      
      generateTTS(textToRead);
    }, 1000);
  });
  
  // 用户消息
  eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
    if (audioState.lastProcessedUserMessageId === messageId) return;
    if (!$("#auto_play_user").prop("checked")) return;
    
    audioState.lastProcessedUserMessageId = messageId;
    setTimeout(() => {
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      const message = messageElement.find('.mes_text').text();
      if (message) generateTTS(message);
    }, 500);
  });
}

// 克隆音色功能
async function uploadVoice() {
  const apiKey = extension_settings[extensionName].apiKey;
  const apiUrl = extension_settings[extensionName].apiUrl;
  const voiceName = $("#clone_voice_name").val();
  const voiceText = $("#clone_voice_text").val();
  const audioFile = $("#clone_voice_audio")[0].files[0];
  
  if (!apiKey || !voiceName || !voiceText || !audioFile) {
    toastr.error("请填写完整信息", "克隆错误");
    return;
  }
  
  try {
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
        
        if (!response.ok) throw new Error(await response.text());
        
        toastr.success(`音色 "${voiceName}" 克隆成功！`, "克隆音色");
        $("#clone_voice_name").val("");
        await loadCustomVoices();
        
      } catch (error) {
        toastr.error(`失败: ${error.message}`, "克隆错误");
      }
    };
    reader.readAsDataURL(audioFile);
  } catch (error) {
    console.error(error);
  }
}

// 加载自定义音色列表
async function loadCustomVoices() {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey) return;
  
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      extension_settings[extensionName].customVoices = data.result || data.results || [];
      updateCustomVoicesList();
      updateVoiceOptions();
    }
  } catch (error) {
    console.error("Load Custom Voices Error:", error);
  }
}

// 更新自定义音色UI
function updateCustomVoicesList() {
  const customVoices = extension_settings[extensionName].customVoices || [];
  const listContainer = $("#custom_voices_list");
  
  if (customVoices.length === 0) {
    listContainer.html("<small>暂无自定义音色</small>");
    return;
  }
  
  let html = "";
  customVoices.forEach(voice => {
    const name = voice.name || voice.customName || "未命名";
    html += `
      <div style="margin: 5px 0; padding: 5px; border: 1px solid #ddd;">
        <span>${name}</span>
        <button class="menu_button delete-voice" data-uri="${voice.uri}" data-name="${name}" style="float: right; font-size: 12px;">删除</button>
      </div>`;
  });
  listContainer.html(html);
}

// 删除自定义音色
async function deleteCustomVoice(uri, name) {
  if (!confirm(`确定要删除音色 "${name}" 吗？`)) return;
  
  const apiKey = extension_settings[extensionName].apiKey;
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/deletions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: uri })
    });
    
    if (response.ok) {
      toastr.success(`音色已删除`, "成功");
      await loadCustomVoices();
    }
  } catch (error) {
    toastr.error(`删除失败: ${error.message}`, "错误");
  }
}

// 初始化
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  setTimeout(() => {
    $('.siliconflow-extension-settings .inline-drawer-toggle').on('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        const $content = $(this).next('.inline-drawer-content');
        const $icon = $(this).find('.inline-drawer-icon');
        if ($content.is(':visible')) { $content.hide(); $icon.removeClass('down'); }
        else { $content.show(); $icon.addClass('down'); }
    });
  }, 100);
  
  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#test_siliconflow_connection").on("click", testConnection);
  $("#refresh_models").on("click", fetchRemoteModels);
  
  $("#siliconflow_api_url").on("change", function() {
      extension_settings[extensionName].apiUrl = $(this).val();
  });
  
  $("#tts_model").on("change", function() {
      extension_settings[extensionName].ttsModel = $(this).val();
      updateVoiceOptions(); // 确保音色列表保持可见
  });
  
  $("#upload_voice").on("click", uploadVoice);
  $("#refresh_custom_voices").on("click", loadCustomVoices);
  $(document).on("click", ".delete-voice", function() {
    deleteCustomVoice($(this).data("uri"), $(this).data("name"));
  });
  
  $("#test_tts").on("click", async function() {
    extension_settings[extensionName].ttsVoice = $("#tts_voice").val();
    await generateTTS($("#tts_test_text").val() || "测试语音");
  });
  
  // 自动保存
  $("#auto_play_audio, #auto_play_user").on("change", saveSettings);
  $("#image_text_start, #image_text_end").on("input", () => {
      extension_settings[extensionName].textStart = $("#image_text_start").val();
      extension_settings[extensionName].textEnd = $("#image_text_end").val();
      saveSettingsDebounced();
  });

  await loadSettings();
  await loadCustomVoices();
  setupMessageListener();
  
  console.log("SiliconFlow Extension Loaded (jztdd)");
});

export { generateTTS };
