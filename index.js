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

// 默认设置 (完整保留)
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
  excludeRegex: "", 
  generationFrequency: 5,
  autoPlay: true,
  autoPlayUser: false,
  customVoices: [] 
};

// TTS模型和音色配置 (完整保留)
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

// 1. 加载设置
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

// 2. 音色下拉框更新
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
      const vName = voice.name || voice.customName || "未命名";
      const vUri = voice.uri || voice.id || voice.voice_id;
      voiceSelect.append(`<option value="${vUri}">${vName} (自定义)</option>`);
    });
    voiceSelect.append('</optgroup>');
  }
  
  if (currentValue && voiceSelect.find(`option[value="${currentValue}"]`).length > 0) {
    voiceSelect.val(currentValue);
  } else {
    voiceSelect.val(extension_settings[extensionName].ttsVoice || "alex");
  }
}

// 3. 保存逻辑
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

// 4. TTS 生成核心 (带弹窗)
async function generateTTS(text) {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey || !text || text.trim().length === 0 || audioState.isPlaying) return;
  
  toastr.info("正在合成语音并加载...", "硅基流动", { timeOut: 2000 });
  
  try {
    audioState.isPlaying = true;
    const voiceValue = $("#tts_voice").val() || "alex";
    const speed = parseFloat($("#tts_speed").val());
    const gain = parseFloat($("#tts_gain").val());
    let voiceParam = (voiceValue.includes("/") || voiceValue.startsWith("speech:")) ? voiceValue : `FunAudioLLM/CosyVoice2-0.5B:${voiceValue}`;

    const response = await fetch(`${extension_settings[extensionName].apiUrl}/audio/speech`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "FunAudioLLM/CosyVoice2-0.5B", input: text, voice: voiceParam, response_format: "mp3", speed, gain
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    
    const audioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(audioUrl);
    
    if (extension_settings[extensionName].autoPlay) {
      audio.addEventListener('ended', () => { audioState.isPlaying = false; URL.revokeObjectURL(audioUrl); });
      audio.addEventListener('error', () => { audioState.isPlaying = false; });
      audio.play().catch(err => { audioState.isPlaying = false; });
    } else { audioState.isPlaying = false; }
    
    $("#tts_output").empty().append($(`<a href="${audioUrl}" download="tts.mp3">下载音频</a>`));
  } catch (error) {
    toastr.error(`生成失败: ${error.message}`);
    audioState.isPlaying = false;
  }
}

// 5. 文本清洗与正则过滤
function getCleanText(messageElement) {
    const $clone = messageElement.find('.mes_text').clone();
    $clone.find('pre, code, script, style, details, .summary, .st-ui, .st_internal, [class*="mujica"]').remove();
    let text = $clone.text().trim();

    const excludePattern = $("#tts_exclude_regex").val();
    if (excludePattern) {
        try {
            const regexMatch = excludePattern.match(/^\/(.*?)\/([gimy]*)$/);
            const regex = regexMatch ? new RegExp(regexMatch[1], regexMatch[2]) : new RegExp(excludePattern, 'g');
            text = text.replace(regex, '');
        } catch (e) { console.error("正则错误:", e); }
    }
    return text.trim();
}

// 6. 消息监听与智能标记提取 (保留原版 900 行算法)
function setupMessageListener() {
  eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async (messageId) => {
    if (audioState.lastProcessedMessageId === messageId || !$("#auto_play_audio").prop("checked")) return;
    
    if (audioState.processingTimeout) clearTimeout(audioState.processingTimeout);
    
    audioState.processingTimeout = setTimeout(() => {
      const el = $(`.mes[mesid="${messageId}"]`);
      if (el.hasClass('streaming') || el.find('.typing-indicator').length > 0) {
          eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, messageId);
          return;
      }
      audioState.lastProcessedMessageId = messageId;
      const message = getCleanText(el);
      if (!message) return;

      const textStart = $("#image_text_start").val();
      const textEnd = $("#image_text_end").val();
      
      if (textStart && textEnd) {
        let extractedTexts = [];
        // 核心：处理相同标记（如双引号）的算法
        if (textStart === textEnd) {
          let inside = false, currentText = '';
          for (let char of message) {
            if (char === textStart) {
              if (!inside) { inside = true; currentText = ''; } 
              else { if (currentText.trim()) extractedTexts.push(currentText.trim()); inside = false; }
            } else if (inside) { currentText += char; }
          }
        } else {
          const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`${escapeRegex(textStart)}(.*?)${escapeRegex(textEnd)}`, 'g');
          const matches = message.match(regex);
          if (matches) matches.forEach(m => extractedTexts.push(m.replace(textStart,'').replace(textEnd,'').trim()));
        }
        
        if (extractedTexts.length > 0) {
          generateTTS(extractedTexts.join(' '));
          return;
        }
      } else { generateTTS(message); }
    }, 1200); 
  });

  eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
    if (audioState.lastProcessedUserMessageId === messageId || !$("#auto_play_user").prop("checked")) return;
    audioState.lastProcessedUserMessageId = messageId;
    setTimeout(() => {
      const msg = getCleanText($(`.mes[mesid="${messageId}"]`));
      if (msg) generateTTS(msg);
    }, 500);
  });
}

// 7. 音色克隆 (保留 JSON + FormData 双逻辑)
async function uploadVoice() {
  const apiKey = extension_settings[extensionName].apiKey;
  const voiceName = $("#clone_voice_name").val(), voiceText = $("#clone_voice_text").val(), audioFile = $("#clone_voice_audio")[0].files[0];
  if (!apiKey || !voiceName || !voiceText || !audioFile) { toastr.error("请填全信息"); return; }
  
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const base64Audio = e.target.result;
      const response = await fetch(`${extension_settings[extensionName].apiUrl}/uploads/audio/voice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'FunAudioLLM/CosyVoice2-0.5B', customName: voiceName, text: voiceText, audio: base64Audio })
      });
      
      if (!response.ok) {
        // FormData 备用逻辑
        const formData = new FormData();
        formData.append('model', 'FunAudioLLM/CosyVoice2-0.5B');
        formData.append('customName', voiceName); formData.append('text', voiceText);
        const blob = new Blob([new Uint8Array(atob(base64Audio.split(',')[1]).split("").map(c => c.charCodeAt(0)))], {type: audioFile.type});
        formData.append('audio', blob, audioFile.name);
        await fetch(`${extension_settings[extensionName].apiUrl}/uploads/audio/voice`, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: formData });
      }
      toastr.success(`音色 "${voiceName}" 克隆成功！`);
      await loadCustomVoices();
    } catch (err) { toastr.error("克隆失败"); }
  };
  reader.readAsDataURL(audioFile);
}

async function loadCustomVoices() {
  const apiKey = extension_settings[extensionName].apiKey;
  if (!apiKey) return;
  try {
    const res = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
      method: 'GET', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    extension_settings[extensionName].customVoices = data.result || data.results || [];
    updateCustomVoicesList(); updateVoiceOptions();
  } catch (e) { console.error(e); }
}

function updateCustomVoicesList() {
  const voices = extension_settings[extensionName].customVoices || [];
  const $list = $("#custom_voices_list").empty();
  if (voices.length === 0) { $list.html("<small>暂无自定义音色</small>"); return; }
  voices.forEach(v => {
    $list.append(`<div style="margin:5px 0;padding:12px;background:rgba(0,0,0,0.2);border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
        <span>${v.name || v.customName}</span>
        <button class="menu_button delete-voice" data-uri="${v.uri || v.id}" data-name="${v.name || v.customName}" style="background:#ff4d4f !important;">删除</button>
    </div>`);
  });
}

// 8. 初始化与健壮的折叠绑定
jQuery(async () => {
  const settingsHtml = await $.get(`${extensionFolderPath}/example.html`);
  $("#extensions_settings").append(settingsHtml);
  
  // 使用全局委派确保折叠始终可用
  $(document).on('click', '.siliconflow-extension-settings .inline-drawer-toggle', function(e) {
      e.preventDefault();
      const $drawer = $(this).closest('.inline-drawer');
      const $content = $drawer.find('.inline-drawer-content');
      const $icon = $(this).find('.inline-drawer-icon');
      
      // 使用动画效果，更顺滑
      $content.stop().slideToggle(200);
      $icon.toggleClass('down');
  });

  $("#save_siliconflow_settings").on("click", saveSettings);
  $("#upload_voice").on("click", uploadVoice);
  $("#refresh_custom_voices").on("click", loadCustomVoices);
  $(document).on("click", ".delete-voice", function() {
      const uri = $(this).data("uri"), name = $(this).data("name");
      if (confirm(`删除音色 "${name}"？`)) {
          fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/deletions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${extension_settings[extensionName].apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ uri })
          }).then(() => loadCustomVoices());
      }
  });

  $("#test_siliconflow_connection").on("click", async () => {
      const res = await fetch(`${extension_settings[extensionName].apiUrl}/audio/voice/list`, {
          method: 'GET', headers: { 'Authorization': `Bearer ${$("#siliconflow_api_key").val()}` }
      });
      $("#connection_status").text(res.ok ? "已连接" : "失败").css("color", res.ok ? "green" : "red");
  });

  $("#tts_model").on("change", updateVoiceOptions);
  $("#tts_speed, #tts_gain").on("input", function() { $(`#${this.id}_value`).text($(this).val()); });
  $("#test_tts").on("click", () => generateTTS($("#tts_test_text").val()));
  $("#auto_play_audio, #auto_play_user").on("change", saveSettings);
  $("#image_text_start, #image_text_end, #tts_exclude_regex").on("input", saveSettings);

  await loadSettings();
  await loadCustomVoices();
  setupMessageListener();
  console.log("硅基流动插件 (jztdd) 现代化版本已就绪");
});
