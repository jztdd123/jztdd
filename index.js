import { extension_settings, saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "jztdd";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const audioState = {
    isPlaying: false,
    audioInstance: null
};

const defaultSettings = {
    apiKey: "",
    apiUrl: "https://api.siliconflow.cn/v1",
    ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
    cachedModels: ["FunAudioLLM/CosyVoice2-0.5B", "deepseek-ai/DeepSeek-V3"],
    ttsVoice: "alex",
    ttsSpeed: 1.0,
    ttsGain: 0,
    textStart: "",
    textEnd: "",
    autoPlay: true,
    autoPlayUser: false,
    customVoices: []
};

const COMMON_VOICES = {
    "alex": "Alex (CosyVoice)",
    "anna": "Anna (CosyVoice)",
    "bella": "Bella (CosyVoice)",
    "benjamin": "Benjamin (CosyVoice)",
    "charles": "Charles (CosyVoice)",
    "claire": "Claire (CosyVoice)",
    "david": "David (CosyVoice)",
    "diana": "Diana (CosyVoice)"
};

// --- 状态指示器 ---
function showStatus(msg, persistent = false) {
    let $indicator = $('#tts_status_indicator');
    if ($indicator.length === 0) {
        $indicator = $('<div id="tts_status_indicator"><div class="sf-pulse"></div><span class="status-text"></span></div>');
        $('body').append($indicator);
    }
    $indicator.find('.status-text').text(msg);
    $indicator.css('display', 'flex').fadeIn(200);
    if (!persistent) setTimeout(() => $indicator.fadeOut(500), 3000);
}

function hideStatus() {
    $('#tts_status_indicator').fadeOut(500);
}

// --- 核心：文本提取 ---
function extractText(text, startMarkers, endMarkers) {
    if (!startMarkers || !endMarkers) return text;
    const starts = startMarkers.split(/[,，]/).map(s => s.trim()).filter(s => s);
    const ends = endMarkers.split(/[,，]/).map(s => s.trim()).filter(s => s);
    if (starts.length === 0 || ends.length === 0) return text;

    let parts = [];
    const minLen = Math.min(starts.length, ends.length);
    for (let i = 0; i < minLen; i++) {
        const s = starts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const e = ends[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${s}(.*?)${e}`, 'g');
        const matches = text.matchAll(regex);
        for (const m of matches) parts.push(m[1].trim());
    }
    return parts.length > 0 ? parts.join(' ') : text;
}

// --- 核心：生成与播放 ---
async function generateTTS(text) {
    if (!text || text.trim().length === 0) return;
    const settings = extension_settings[extensionName];
    
    try {
        showStatus("正在合成语音...", true);
        
        const voiceParam = settings.ttsVoice.includes("/") || settings.ttsVoice.includes(":") 
            ? settings.ttsVoice 
            : `${settings.ttsModel}:${settings.ttsVoice}`;

        const response = await fetch(`${settings.apiUrl}/audio/speech`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: settings.ttsModel,
                input: text,
                voice: voiceParam,
                speed: settings.ttsSpeed,
                gain: settings.ttsGain,
                response_format: "mp3"
            })
        });

        if (!response.ok) throw new Error(`API错误: ${response.status}`);

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (audioState.audioInstance) audioState.audioInstance.pause();
        
        const audio = new Audio(url);
        audioState.audioInstance = audio;
        
        audio.onplay = () => {
            audioState.isPlaying = true;
            showStatus("正在朗读...");
        };
        audio.onended = () => {
            audioState.isPlaying = false;
            hideStatus();
            URL.revokeObjectURL(url);
        };
        
        await audio.play();
        $("#tts_output").html(`<a href="${url}" download="tts.mp3" style="color:var(--sf-primary); font-size:0.8em;">下载最近一次语音</a>`);

    } catch (e) {
        console.error("TTS Error:", e);
        toastr.error(e.message, "语音合成失败");
        hideStatus();
    }
}

// --- 消息监听器优化 ---
function setupListeners() {
    // 关键改变：监听流传输完成事件
    eventSource.on(event_types.STREAM_FINISHED, async (messageId) => {
        if (!extension_settings[extensionName].autoPlay) return;
        
        // 稍微延迟确保 DOM 加载完毕
        setTimeout(() => {
            const $mes = $(`.mes[mesid="${messageId}"]`);
            if ($mes.find('.ch_name').length > 0 || $mes.hasClass('last_mes')) {
                const rawText = $mes.find('.mes_text').text();
                const cleanText = extractText(rawText, extension_settings[extensionName].textStart, extension_settings[extensionName].textEnd);
                generateTTS(cleanText);
            }
        }, 300);
    });

    eventSource.on(event_types.USER_MESSAGE_RENDERED, (messageId) => {
        if (!extension_settings[extensionName].autoPlayUser) return;
        const text = $(`.mes[mesid="${messageId}"] .mes_text`).text();
        generateTTS(text);
    });
}

// --- 初始化与 UI 绑定 ---
async function loadSettings() {
    extension_settings[extensionName] = { ...defaultSettings, ...extension_settings[extensionName] };
    const s = extension_settings[extensionName];

    $("#siliconflow_api_key").val(s.apiKey);
    $("#siliconflow_api_url").val(s.apiUrl);
    $("#image_text_start").val(s.textStart);
    $("#image_text_end").val(s.textEnd);
    $("#auto_play_audio").prop("checked", s.autoPlay);
    $("#auto_play_user").prop("checked", s.autoPlayUser);
    $("#tts_speed").val(s.ttsSpeed);
    $("#tts_speed_value").text(s.ttsSpeed);
    $("#tts_gain").val(s.ttsGain);
    $("#tts_gain_value").text(s.ttsGain);

    updateModelSelect(s.cachedModels, s.ttsModel);
    updateVoiceOptions(s.ttsVoice);
}

function updateModelSelect(models, current) {
    const $m = $("#tts_model").empty();
    models.forEach(m => $m.append(new Option(m, m)));
    $m.val(current || models[0]);
}

function updateVoiceOptions(current) {
    const $v = $("#tts_voice").empty();
    const group = $('<optgroup label="预设音色"></optgroup>');
    Object.entries(COMMON_VOICES).forEach(([k, v]) => group.append(new Option(v, k)));
    $v.append(group);
    
    const custom = extension_settings[extensionName].customVoices || [];
    if (custom.length > 0) {
        const cg = $('<optgroup label="自定义音色"></optgroup>');
        custom.forEach(cv => cg.append(new Option(cv.name || cv.customName, cv.uri)));
        $v.append(cg);
    }
    $v.val(current || "alex");
}

$(async () => {
    const html = await $.get(`${extensionFolderPath}/example.html`);
    $("#extensions_settings").append(html);

    $(document).on('click', '.inline-drawer-toggle', function() {
        $(this).next().slideToggle(200);
        $(this).find('.inline-drawer-icon').toggleClass('fa-chevron-down fa-chevron-up');
    });

    $("#save_siliconflow_settings").on("click", () => {
        const s = extension_settings[extensionName];
        s.apiKey = $("#siliconflow_api_key").val();
        s.apiUrl = $("#siliconflow_api_url").val();
        s.ttsModel = $("#tts_model").val();
        s.ttsVoice = $("#tts_voice").val();
        s.textStart = $("#image_text_start").val();
        s.textEnd = $("#image_text_end").val();
        s.autoPlay = $("#auto_play_audio").prop("checked");
        s.autoPlayUser = $("#auto_play_user").prop("checked");
        s.ttsSpeed = parseFloat($("#tts_speed").val());
        s.ttsGain = parseFloat($("#tts_gain").val());
        saveSettingsDebounced();
        toastr.success("设置已保存");
    });

    $("#tts_speed").on("input", function() { $("#tts_speed_value").text($(this).val()); });
    $("#tts_gain").on("input", function() { $("#tts_gain_value").text($(this).val()); });

    $("#test_tts").on("click", () => generateTTS($("#tts_test_text").val()));

    $("#test_siliconflow_connection").on("click", async () => {
        try {
            const res = await fetch(`${$("#siliconflow_api_url").val()}/models`, {
                headers: { 'Authorization': `Bearer ${$("#siliconflow_api_key").val()}` }
            });
            if (res.ok) {
                $("#connection_status").text("已连接").css("color", "#4ade80");
                toastr.success("连接成功");
            } else throw new Error();
        } catch {
            $("#connection_status").text("连接失败").css("color", "#ff4d4d");
        }
    });

    await loadSettings();
    setupListeners();
});
