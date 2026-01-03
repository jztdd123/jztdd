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

// 默认设置 - 严格保留你原本的所有字段，仅新增 excludeRegex
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
  excludeRegex: "", // 新增：排除正则
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [] 
};

// TTS模型和音色配置 (保留原版结构)
const TTS_MODELS = {
  "FunAudioLLM/CosyVoice2-0.5B": {
    name: "CosyVoice2-0.5B",
    voices: {
      "alex": "Alex (男声)", "anna": "Anna (女声)", "bella": "Bella (女声)",
      "benjamin": "Benjamin (男声)", "charles": "Charles (男声)", "claire": "Claire (女声)",
      "david": "David (男声)", "diana": "Diana (女声)"
    }
  }
};

// 加载设置 (完整保留)
async function loadSettings() {
  extension_settings[extensionName] = extension_settings[extensionName] || {};
  if (Object.keys(extension_settings[extensionName]).length === 0) {
    Object.assign(extension_settings[extensionName], defaultSettings);
  }

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
  $("#tts_exclude_regex").val(extension_settings[extensionName].excludeRegex || ""); 
  
  $("#auto_play_audio").prop("checked", extension_settings[extensionName].autoPlay !== false);
  $("#auto_play_user").prop("checked", extension_settings[extensionName].autoPlayUser === true);
  
  updateVoiceOptions();
}

// 更新音色选项 (保留原版逻辑)
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
  if (!apiKey) { toastr.error("请先输入API密钥", "连接失败"); return; }
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      $("#connection_status").text("已连接").css("color", "green");
      console.log("API连接成功");
    } else { throw new Error(`HTTP ${response.status}`); }
  } catch (error) {
    toastr.error(`连接失败: ${error.message}`);
    $("#connection_status").text("未连接").css("color", "red");
  }
}

// TTS功能 (加入弹窗提示)
async function generateTTS(text) {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey || !text || text.trim().length === 0) return;
  if (audioState.isPlaying) { console.log('音频处理中，跳过'); return; }
  
  toastr.info("正在合成语音并加载...", "硅基流动", { timeOut: 2000 });
  
  try {
    audioState.isPlaying = true;
    const voiceValue = $("#tts_voice").val() || "alex";
    const speed = parseFloat($("#tts_speed").val()) || 1.0;
    const gain = parseFloat($("#tts_gain").val()) || 0;
    let voiceParam = (voiceValue.includes("/") || voiceValue.startsWith("speech:")) ? voiceValue : `FunAudioLLM/CosyVoice2-0.5B:${voiceValue}`;
    
    console.log('TTS请求参数:', { voiceParam, speed, gain });

    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/speech`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: "FunAudioLLM/CosyVoice2-0.5B", input: text, voice: voiceParam, response_format: "mp3", speed, gain })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    
    if (extension_settings[extensionName].autoPlay) {
      audio.addEventListener('ended', () => { audioState.isPlaying = false; URL.revokeObjectURL(audioUrl); });
      audio.addEventListener('error', () => { audioState.isPlaying = false; });
      audio.play().catch(err => { audioState.isPlaying = false; });
    } else { audioState.isPlaying = false; }
    
    $("#tts_output").empty().append($(`<a href="${audioUrl}" download="tts.mp3">下载音频</a>`));
  } catch (error) { toastr.error(`语音生成失败: ${error.message}`); audioState.isPlaying = false; }
}

// 【新增核心补丁】清洗文本，应用正则排除
function getCleanText(messageElement) {
    const $clone = messageElement.find('.mes_text').clone();
    // 剔除代码、摘要、脚本等干扰项
    $clone.find('pre, code, script, style, details, .summary, .message_summary, .st-ui, .st_internal, [class*="mujica"]').remove();
    let text = $clone.text().trim();

    // 应用用户自定义的排除正则
    const excludePattern = $("#tts_exclude_regex").val();
    if (excludePattern) {
        try {
            const regexMatch = excludePattern.match(/^\/(.*?)\/([gimy]*)$/);
            const regex = regexMatch ? new RegExp(regexMatch[1], regexMatch[2]) : new RegExp(excludePattern, 'g');
            text = text.replace(regex, '');
        } catch (e) { console.error("正则排除错误:", e); }
    }
    return text.trim();
}

// 消息监听器 (严格保留原版所有 console.log 和 手动引号匹配算法)
function setupMessageListener() {
  console.log('设置消息监听器...');
  
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    console.log('角色消息渲染:', messageId);
    if (audioState.lastProcessedMessageId === messageId || !$("#auto_play_audio").prop("checked")) return;
    
    if (audioState.processingTimeout) clearTimeout(audioState.processingTimeout);
    
    audioState.processingTimeout = setTimeout(() => {
      const messageElement = $(`.mes[mesid="${messageId}"]`);
      // 稳定性优化：检查流式输出
      if (messageElement.hasClass('streaming') || messageElement.find('.typing-indicator').length > 0) {
          eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId);
          return;
      }

      audioState.lastProcessedMessageId = messageId;
      const message = getCleanText(messageElement);
      if (!message) return;
      
      const textStart = $("#image_text_start").val();
      const textEnd = $("#image_text_end").val();
      
      if (textStart && textEnd) {
        let extractedTexts = [];
        // 【保留原版】相同标记配对逻辑
        if (textStart === textEnd) {
          let insideQuote = false, currentText = '';
          for (let i = 0; i < message.length; i++) {
            if (message[i] === textStart) {
              if (!insideQuote) { insideQuote = true; currentText = ''; } 
              else { if (currentText.trim()) extractedTexts.push(currentText.trim()); insideQuote = false; }
            } else if (insideQuote) { currentText += message[i]; }
          }
        } else {
          // 不同标记正则逻辑
          const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`${escapeRegex(textStart)}(.*?)${escapeRegex(textEnd)}`, 'g');
          const matches = message.match(regex);
          if (matches) matches.forEach(m => extractedTexts.push(m.replace(textStart, '').replace(textEnd, '').trim()));
        }
        
        if (extractedTexts.length > 0) {
          console.log('自动朗读标记文本:', extractedTexts.join(' '));
          generateTTS(extractedTexts.join(' '));
        }
      } else {
        generateTTS(message);
      }
    }, 1200); 
  });
  
  eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
    if (audioState.lastProcessedUserMessageId === messageId || !$("#auto_play_user").prop("checked")) return;
    audioState.lastProcessedUserMessageId = messageId;
    setTimeout(() => {
      const message = getCleanText($(`.mes[mesid="${messageId}"]`));
      if (message) generateTTS(message);
    }, 500);
  });
}

// 音色克隆功能 (完整保留原版 JSON + FormData 双重上传逻辑)
async function uploadVoice() {
  const apiKey = extension_settings[extensionName].apiKey;
  const voiceName = $("#clone_voice_name").val(), voiceText = $("#clone_voice_text").val(), audioFile = $("#clone_voice_audio")[0].files[0];
  if (!apiKey || !voiceName || !voiceText || !audioFile) { toastr.error("请填全信息"); return; }
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const base64Audio = e.target.result;
      console.log("尝试上传音色...");
      const response = await fetch(`${extension_settings[extensionName].apiUrl}/uploads/audio/voice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'FunAudioLLM/CosyVoice2-0.5B', customName: voiceName, text: voiceText, audio: base64Audio })
      });
      
      if (!response.ok) {
        console.log("JSON失败，切换 FormData...");
        const formData = new FormData();
        formData.append('model', 'FunAudioLLM/CosyVoice2-0.5B');
        formData.append('customName', voiceName); formData.append('text', voiceText);
        const byteCharacters = atob(base64Audio.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        formData.append('audio', new Blob([new Uint8Array(byteNumbers)], {type: audioFile.type}), audioFile.name);
        
        const response2 = await fetch(`${extension_settings[extensionName].apiUrl}/uploads/audio/voice`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: formData
        });
        if (!response2.ok) throw new Error(await response2.text());
      }
      toastr.success(`音色 "${voiceName}" 克隆成功！`);
      await loadCustomVoices();
    } catch (error) { toastr.error(`克隆错误: ${error.message}`); }
  };
  reader.readAsDataURL(audioFile);
}

// 加载音色列表 (保留原版逻辑)
async function loadCustomVoices() {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey) return;
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      const data = await response.json();
      extension_settings[extensionName].customVoices = data.result || data.results || [];
      updateCustomVoicesList();
      updateVoiceOptions();
    }
  } catch (error) { console.error("加载音色列表失败", error); }
}

function updateCustomVoicesList() {
  const customVoices = extension_settings[extensionName].customVoices || [];
  const listContainer = $("#custom_voices_list");
  if (customVoices.length === 0) { listContainer.html("<small>暂无自定义音色</small>"); return; }
  let html = "";
  customVoices.forEach(voice => {
    const vName = voice.name || voice.customName || "未命名";
    html += `<div style="margin: 5px 0; padding: 10px; background: rgba(0,0,0,0.1); border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span>${vName}</span>
        <button class="menu_button delete-voice" data-uri="${voice.uri || voice.id}" data-name="${vName}" style="background:#ff4d4f !important;">删除</button>
      </div>`;
  });
  listContainer.html(html);
}

// 删除音色
async function deleteCustomVoice(uri, name) {
  if (!confirm(`确定删除 "${name}"？`)) return;
  try {
    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/deletions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${extension_settings[extensionName].apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri })
    });
    if (response.ok) { toastr.success("已删除"); await loadCustomVoices(); }
  } catch (error) { toastr.error("删除失败"); }
}

// 初始化绑定 (修复折叠逻辑并保留所有原版事件)
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  // 核心：折叠面板点击修复
  setTimeout(() => {
    $(document).on('click', '.siliconflow-extension-settings .inline-drawer-toggle', function(e) {
        e.preventDefault(); e.stopPropagation();
        const $content = $(this).next('.inline-drawer-content');
        const $icon = $(this).find('.inline-drawer-icon');
        // 使用原版那种最稳健的逻辑切换
        if ($content.is(':visible')) { $content.hide(); $icon.removeClass('down'); }
        else { $content.show(); $icon.addClass('down'); }
    });
  }, 100);
  
  // 绑定所有交互
  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#upload_voice").on("click", uploadVoice);
  $("#refresh_custom_voices").on("click", loadCustomVoices);
  $("#test_siliconflow_connection").on("click", testConnection);
  $("#tts_model").on("change", updateVoiceOptions);
  $("#test_tts").on("click", () => generateTTS($("#tts_test_text").val()));
  $(document).on("click", ".delete-voice", function() { deleteCustomVoice($(this).data("uri"), $(this).data("name")); });

  // 实时显示语速音量
  $("#tts_speed, #tts_gain").on("input", function() { $(`#${this.id}_value`).text($(this).val()); });

  // 字段自动保存
  $("#auto_play_audio, #auto_play_user").on("change", saveSettings);
  $("#image_text_start, #image_text_end, #tts_exclude_regex").on("input", saveSettings);

  await loadSettings();
  await loadCustomVoices();
  setupMessageListener();
  
  console.log("硅基流动插件 (jztdd) 完整重制版已就绪");
});
