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
  ttsVoice: "alex",
  ttsSpeed: 1.0,
  ttsGain: 0,
  responseFormat: "mp3",
  sampleRate: 32000,
  imageModel: "",
  imageSize: "512",
  textStart: "“",
  textEnd: "”",
  excludeRegex: "", // 存储排除正则
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [] // 存储自定义音色列表
};

// TTS模型和音色配置 (保留原版结构)
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
  $("#image_text_start").val(extension_settings[extensionName].textStart || defaultSettings.textStart);
  $("#image_text_end").val(extension_settings[extensionName].textEnd || defaultSettings.textEnd);
  $("#tts_exclude_regex").val(extension_settings[extensionName].excludeRegex || ""); // 加载排除正则
  
  $("#auto_play_audio").prop("checked", extension_settings[extensionName].autoPlay !== false);
  $("#auto_play_user").prop("checked", extension_settings[extensionName].autoPlayUser === true);
  
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
  }
  
  // 添加自定义音色
  const customVoices = extension_settings[extensionName].customVoices || [];
  console.log(`更新音色选项，自定义音色数量: ${customVoices.length}`);
  
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
    voiceSelect.val(extension_settings[extensionName].ttsVoice || Object.keys(TTS_MODELS[model]?.voices || {})[0]);
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
  extension_settings[extensionName].excludeRegex = $("#tts_exclude_regex").val();
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
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      $("#connection_status").text("已连接").css("color", "green");
      console.log("API连接成功");
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    toastr.error(`连接失败: ${error.message}`, "硅基流动插件");
    $("#connection_status").text("未连接").css("color", "red");
  }
}

// TTS功能
async function generateTTS(text) {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey) { toastr.error("请先配置API密钥", "TTS错误"); return; }
  if (!text || text.trim().length === 0) return;
  if (audioState.isPlaying) { console.log('音频处理中，跳过'); return; }
  
  // 新增弹窗提示
  toastr.info("正在合成语音并加载...", "硅基流动", { timeOut: 2000 });
  
  try {
    audioState.isPlaying = true;
    console.log("正在生成语音...");
    
    const voiceValue = $("#tts_voice").val() || "alex";
    const speed = parseFloat($("#tts_speed").val()) || 1.0;
    const gain = parseFloat($("#tts_gain").val()) || 0;
    
    let voiceParam;
    if (voiceValue.includes("/") || voiceValue.startsWith("speech:")) {
      voiceParam = voiceValue;
    } else {
      voiceParam = `FunAudioLLM/CosyVoice2-0.5B:${voiceValue}`;
    }
    
    const requestBody = {
      model: "FunAudioLLM/CosyVoice2-0.5B",
      input: text,
      voice: voiceParam,
      response_format: "mp3",
      speed: speed,
      gain: gain
    };
    
    console.log('TTS请求参数:', requestBody);
    
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    
    if (extension_settings[extensionName].autoPlay) {
      audioState.isPlaying = true;
      audio.addEventListener('ended', () => { audioState.isPlaying = false; URL.revokeObjectURL(audioUrl); });
      audio.addEventListener('error', () => { audioState.isPlaying = false; });
      audio.play().catch(err => { audioState.isPlaying = false; console.error('播放失败:', err); });
    } else {
      audioState.isPlaying = false;
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

// 新增文本清洗逻辑
function getCleanText(messageElement) {
    const $clone = messageElement.find('.mes_text').clone();
    
    // 物理剔除 HTML 干扰
    $clone.find('pre, code, script, style, details, .summary, .message_summary, .st-ui, .st_internal, [class*="mujica"]').remove();
    
    let text = $clone.text().trim();

    // 应用自定义排除正则
    const excludePattern = $("#tts_exclude_regex").val();
    if (excludePattern) {
        try {
            const regexMatch = excludePattern.match(/^\/(.*?)\/([gimy]*)$/);
            const regex = regexMatch ? new RegExp(regexMatch[1], regexMatch[2]) : new RegExp(excludePattern, 'g');
            text = text.replace(regex, '');
        } catch (e) { console.error("排除正则错误:", e); }
    }
    
    return text.trim();
}

// 监听消息事件 (保留 900 行版的全调试日志)
function setupMessageListener() {
  console.log('设置消息监听器');
  console.log('事件类型:', event_types);
  
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    console.log('角色消息渲染:', messageId);
    if (audioState.lastProcessedMessageId === messageId) return;
    
    const autoPlay = $("#auto_play_audio").prop("checked");
    if (!autoPlay) return;
    
    if (audioState.processingTimeout) clearTimeout(audioState.processingTimeout);
    
    audioState.processingTimeout = setTimeout(() => {
      console.log('延时处理开始:', messageId);
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      
      // 稳定性优化：检查是否还在生成中
      if (messageElement.hasClass('streaming') || messageElement.find('.typing-indicator').length > 0) {
          console.log("正文生成中，延迟重试...");
          eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId);
          return;
      }

      audioState.lastProcessedMessageId = messageId;
      
      // 使用清洗逻辑获取正文
      const message = getCleanText(messageElement);
      console.log('清洗后正文长度:', message ? message.length : 0);
      
      if (!message) return;
      
      const textStart = $("#image_text_start").val();
      const textEnd = $("#image_text_end").val();
      
      if (textStart && textEnd) {
        let extractedTexts = [];
        // 保留原版“相同标记配对”逻辑
        if (textStart === textEnd) {
          let insideQuote = false;
          let currentText = '';
          for (let i = 0; i < message.length; i++) {
            const char = message[i];
            if (char === textStart) {
              if (!insideQuote) { insideQuote = true; currentText = ''; } 
              else { if (currentText.trim()) extractedTexts.push(currentText.trim()); insideQuote = false; }
            } else if (insideQuote) {
              currentText += char;
            }
          }
        } else {
          // 不同标记正则逻辑
          const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`${escapeRegex(textStart)}(.*?)${escapeRegex(textEnd)}`, 'g');
          const matches = message.match(regex);
          if (matches) {
            matches.forEach(match => {
              const clean = match.replace(textStart, '').replace(textEnd, '').trim();
              if (clean) extractedTexts.push(clean);
            });
          }
        }
        
        if (extractedTexts.length > 0) {
          const finalText = extractedTexts.join(' ');
          console.log('自动朗读标记内文本:', finalText);
          generateTTS(finalText);
          return;
        }
      } else {
        console.log('未设置标记，自动朗读全文');
        generateTTS(message);
      }
    }, 1200); 
  });
  
  // 用户消息监听 (同样保留调试日志)
  eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
    if (audioState.lastProcessedUserMessageId === messageId) return;
    const autoPlayUser = $("#auto_play_user").prop("checked");
    if (!autoPlayUser) return;
    audioState.lastProcessedUserMessageId = messageId;
    
    setTimeout(() => {
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      const message = getCleanText(messageElement);
      if (message) generateTTS(message);
    }, 500);
  });
}

// 克隆音色功能 (保留原版 JSON + FormData 双重逻辑)
async function uploadVoice() {
  const apiKey = extension_settings[extensionName].apiKey;
  const voiceName = $("#clone_voice_name").val();
  const voiceText = $("#clone_voice_text").val();
  const audioFile = $("#clone_voice_audio")[0].files[0];
  
  if (!apiKey || !voiceName || !voiceText || !audioFile) {
    toastr.error("请填全信息", "克隆错误");
    return;
  }
  
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
      
      console.log("尝试 JSON 方式上传...");
      const response = await fetch(`${extension_settings[extensionName].apiUrl}/uploads/audio/voice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        console.log("JSON方式失败，尝试 FormData 方式...");
        const formData = new FormData();
        formData.append('model', 'FunAudioLLM/CosyVoice2-0.5B');
        formData.append('customName', voiceName);
        formData.append('text', voiceText);
        
        const base64Data = base64Audio.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const blob = new Blob([new Uint8Array(byteNumbers)], {type: audioFile.type});
        formData.append('audio', blob, audioFile.name);
        
        const response2 = await fetch(`${extension_settings[extensionName].apiUrl}/uploads/audio/voice`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          body: formData
        });
        if (!response2.ok) throw new Error(await response2.text());
      }
      
      toastr.success(`音色 "${voiceName}" 克隆成功！`);
      await loadCustomVoices();
    } catch (error) {
      toastr.error(`克隆失败: ${error.message}`);
    }
  };
  reader.readAsDataURL(audioFile);
}

// 加载音色列表
async function loadCustomVoices() {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey) return;
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    extension_settings[extensionName].customVoices = data.result || data.results || [];
    updateCustomVoicesList();
    updateVoiceOptions();
  } catch (error) { console.error("加载自定义音色错误:", error); }
}

function updateCustomVoicesList() {
  const customVoices = extension_settings[extensionName].customVoices || [];
  const listContainer = $("#custom_voices_list");
  if (customVoices.length === 0) { listContainer.html("<small>暂无自定义音色</small>"); return; }
  let html = "";
  customVoices.forEach(voice => {
    const vName = voice.name || voice.customName || "未命名";
    const vUri = voice.uri || voice.id || voice.voice_id;
    html += `<div style="margin: 5px 0; padding: 8px; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span>${vName}</span>
        <button class="menu_button delete-voice" data-uri="${vUri}" data-name="${vName}" style="font-size: 11px;">删除</button>
      </div>`;
  });
  listContainer.html(html);
}

async function deleteCustomVoice(uri, name) {
  if (!confirm(`确定要删除音色 "${name}" 吗？`)) return;
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/deletions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${extension_settings[extensionName].apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: uri })
    });
    if (response.ok) { toastr.success(`音色已删除`); await loadCustomVoices(); }
  } catch (error) { toastr.error(`删除失败: ${error.message}`); }
}

// jQuery加载时初始化 (保留原版 900 行版的完整初始化绑定)
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  // 原版折叠逻辑修复
  setTimeout(() => {
    $('.siliconflow-extension-settings .inline-drawer-toggle').each(function() {
      $(this).off('click').on('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        const $header = $(this);
        const $icon = $header.find('.inline-drawer-icon');
        const $content = $header.next('.inline-drawer-content');
        if ($content.is(':visible')) { $content.hide(); $icon.removeClass('down'); } 
        else { $content.show(); $icon.addClass('down'); }
      });
    });
  }, 100);
  
  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#upload_voice").on("click", uploadVoice);
  $("#refresh_custom_voices").on("click", loadCustomVoices);
  $(document).on("click", ".delete-voice", function() { deleteCustomVoice($(this).data("uri"), $(this).data("name")); });
  $("#test_siliconflow_connection").on("click", testConnection);
  $("#tts_model").on("change", updateVoiceOptions);
  $("#tts_speed").on("input", function() { $("#tts_speed_value").text($(this).val()); });
  $("#tts_gain").on("input", function() { $("#tts_gain_value").text($(this).val()); });
  $("#test_tts").on("click", () => generateTTS($("#tts_test_text").val()));

  // 自动化复选框和正则字段实时保存
  $("#auto_play_audio, #auto_play_user").on("change", saveSettings);
  $("#image_text_start, #image_text_end, #tts_exclude_regex").on("input", saveSettings);

  await loadSettings();
  await loadCustomVoices();
  setupMessageListener();
  
  console.log("硅基流动插件 (jztdd) 完整版已加载");
});
