import { extension_settings, saveSettingsDebounced, eventSource, event_types } from "../../../../script.js";

const extensionName = "jztdd";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

// 默认设置
const defaultSettings = {
    apiKey: "",
    apiUrl: "https://api.siliconflow.cn/v1",
    ttsModel: "FunAudioLLM/CosyVoice2-0.5B",
    cachedModels: ["FunAudioLLM/CosyVoice2-0.5B"],
    ttsVoice: "alex",
    ttsSpeed: 1.0,
    ttsGain: 0,
    textStart: "",
    textEnd: "",
    autoPlay: true,
    autoPlayUser: false
};

// 内部状态
let isPlaying = false;
let audioInstance = null;

// 状态提示窗逻辑
function showStatus(msg, persistent = false) {
    let $indicator = $('#tts_status_indicator');
    if ($indicator.length === 0) {
        $indicator = $('<div id="tts_status_indicator" style="position:fixed;top:20px;right:20px;z-index:10000;padding:10px 20px;border-radius:10px;background:rgba(0,0,0,0.8);color:white;display:flex;align-items:center;gap:10px;border:1px solid #6366f1;box-shadow:0 4px 15px rgba(0,0,0,0.5);"><div class="sf-pulse" style="width:10px;height:10px;background:#6366f1;border-radius:50%;"></div><span class="status-text"></span></div>');
        $('body').append($indicator);
    }
    $indicator.find('.status-text').text(msg);
    $indicator.stop(true, true).fadeIn(200);
    if (!persistent) setTimeout(() => $indicator.fadeOut(500), 3000);
}

// 文本提取逻辑
function extractText(text) {
    const sMarkers = extension_settings[extensionName].textStart;
    const eMarkers = extension_settings[extensionName].textEnd;
    if (!sMarkers || !eMarkers) return text;

    const starts = sMarkers.split(/[,，]/).map(s => s.trim()).filter(s => s);
    const ends = eMarkers.split(/[,，]/).map(s => s.trim()).filter(s => s);
    
    let parts = [];
    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
        const s = starts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const e = ends[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`${s}(.*?)${e}`, 'g');
        const matches = text.matchAll(regex);
        for (const m of matches) parts.push(m[1].trim());
    }
    return parts.length > 0 ? parts.join(' ') : text;
}

// TTS 生成函数
async function generateTTS(text) {
    if (!text || text.trim().length === 0) return;
    const settings = extension_settings[extensionName];
    if (!settings.apiKey) return toastr.warning("请先配置 SiliconFlow API Key");

    try {
        showStatus("合成中...", true);
        const voiceParam = settings.ttsVoice.includes(":") ? settings.ttsVoice : `${settings.ttsModel}:${settings.ttsVoice}`;

        const response = await fetch(`${settings.apiUrl}/audio/speech`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ttsModel,
                input: text,
                voice: voiceParam,
                speed: settings.ttsSpeed,
                gain: settings.ttsGain,
                response_format: "mp3"
            })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        if (audioInstance) audioInstance.pause();
        
        audioInstance = new Audio(URL.createObjectURL(blob));
        audioInstance.onplay = () => showStatus("正在播放...");
        audioInstance.onended = () => $('#tts_status_indicator').fadeOut(500);
        await audioInstance.play();
    } catch (e) {
        console.error("TTS失败:", e);
        toastr.error("语音合成出错");
        $('#tts_status_indicator').hide();
    }
}

// 初始化设置
function initSettings() {
    extension_settings[extensionName] = { ...defaultSettings, ...extension_settings[extensionName] };
    const s = extension_settings[extensionName];

    $("#siliconflow_api_key").val(s.apiKey);
    $("#siliconflow_api_url").val(s.apiUrl);
    $("#image_text_start").val(s.textStart);
    $("#image_text_end").val(s.textEnd);
    $("#auto_play_audio").prop("checked", s.autoPlay);
    $("#auto_play_user").prop("checked", s.autoPlayUser);
    $("#tts_speed").val(s.ttsSpeed);
    $("#tts_gain").val(s.ttsGain);

    // 填充模型下拉
    const $m = $("#tts_model").empty();
    s.cachedModels.forEach(m => $m.append(new Option(m, m)));
    $m.val(s.ttsModel);

    // 填充音色下拉
    const $v = $("#tts_voice").empty();
    ["alex", "anna", "bella", "benjamin", "charles", "claire", "david", "diana"].forEach(v => $v.append(new Option(v, v)));
    $v.val(s.ttsVoice);
}

// 插件入口
$(async () => {
    try {
        // 加载 HTML
        const html = await $.get(`${extensionFolderPath}/example.html`);
        if (!html) throw new Error("无法加载 HTML 文件");
        
        // 确保挂载到酒馆扩展设置面板
        $("#extensions_settings").append(html);

        // 绑定事件
        $(document).on('click', '#save_siliconflow_settings', () => {
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
            toastr.success("配置已保存");
        });

        $(document).on('click', '#test_tts', () => {
            const txt = $("#tts_test_text").val();
            generateTTS(txt);
        });

        // 消息监听
        eventSource.on(event_types.STREAM_FINISHED, (messageId) => {
            if (!extension_settings[extensionName].autoPlay) return;
            setTimeout(() => {
                const $mes = $(`.mes[mesid="${messageId}"]`);
                if ($mes.find('.ch_name').length > 0 || $mes.hasClass('last_mes')) {
                    const cleanText = extractText($mes.find('.mes_text').text());
                    generateTTS(cleanText);
                }
            }, 500);
        });

        initSettings();
        console.log("SiliconFlow 插件加载成功");

    } catch (err) {
        console.error("SiliconFlow 插件启动失败:", err);
    }
});
