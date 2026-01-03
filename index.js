<div class="siliconflow-extension-settings">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b>语音功能（TTS）</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
    </div>
    <div class="inline-drawer-content" style="display: none;">

      </!-->
      <div class="flex-container flexGap5" style="margin-bottom: 10px;">
        <label for="siliconflow_api_key">API密钥：</label>
        <input id="siliconflow_api_key" type="password" class="text_pole wide100p" placeholder="请输入API密钥" /></input>
      </div>

      <div class="flex-container flexGap5" style="margin-bottom: 10px;">
        <label for="siliconflow_api_url">API地址：</label>
        <input id="siliconflow_api_url" type="text" class="text_pole wide100p" placeholder="https://api.siliconflow.cn/v1" /></input>
        <small style="color: #888;">支持兼容 OpenAI 格式的 API 地址</small>
      </div>

      <div class="flex-container flexGap5" style="margin-bottom: 15px;">
        <button id="test_siliconflow_connection" class="menu_button">测试连接</button>
        <button id="save_siliconflow_settings" class="menu_button">保存设置</button>
        <span id="connection_status" style="margin-left: 10px; font-size: 12px;">未连接</span>
      </div>

      <hr style="margin: 15px 0; border-color: #444;">
</hr>
      </!-->
      <div class="flex-container flexGap5 alignItemsCenter" style="margin-bottom: 10px;">
        <label for="tts_model">TTS模型：</label>
        <select id="tts_model" class="text_pole" style="flex: 1;">
          <option value="FunAudioLLM/CosyVoice2-0.5B">CosyVoice2-0.5B (默认)</option>
        </select>
      </div>

      <div class="flex-container flexGap5 alignItemsCenter" style="margin-bottom: 10px;">
        <button id="fetch_models_btn" class="menu_button" title="从API获取可用模型列表">获取模型</button>
        <button id="test_model_btn" class="menu_button" title="测试当前选中的模型是否可用">测试模型</button>
        <span id="model_test_status" style="font-size: 12px; margin-left: 10px;"></span>
        <small style="color: #888; margin-left: auto;">点击获取模型从API获取可用模型列表</small>
      </div>

      <hr style="margin: 15px 0; border-color: #444;">
</hr>
      </!-->
      <div class="flex-container flexGap5" style="margin-bottom: 10px;">
        <label for="tts_voice">语音角色：</label>
        <select id="tts_voice" class="text_pole wide100p">
          <optgroup label="预设音色">
            <option value="alex">Alex (男声)</option>
            <option value="anna">Anna (女声)</option>
            <option value="bella">Bella (女声)</option>
            <option value="benjamin">Benjamin (男声)</option>
            <option value="charles">Charles (男声)</option>
            <option value="claire">Claire (女声)</option>
            <option value="david">David (男声)</option>
            <option value="diana">Diana (女声)</option>
          </optgroup>
        </select>
      </div>

      </!-->
      <div class="flex-container flexGap5 alignItemsCenter" style="margin-bottom: 10px;">
        <label for="tts_speed">语速（0.25-4.0）：</label>
        <input id="tts_speed" type="range" min="0.25" max="4.0" step="0.05" value="1.0" style="flex: 1;" /></input>
        <span id="tts_speed_value" style="min-width: 40px; text-align: center;">1.0</span>
      </div>

      </!-->
      <div class="flex-container flexGap5 alignItemsCenter" style="margin-bottom: 10px;">
        <label for="tts_gain">音量增益（-10到10）：</label>
        <input id="tts_gain" type="range" min="-10" max="10" step="0.5" value="0" style="flex: 1;" /></input>
        <span id="tts_gain_value" style="min-width: 40px; text-align: center;">0</span>
      </div>

      </!-->
      <div class="flex-container flexGap5" style="margin-bottom: 10px;">
        <label class="checkbox_label">
          <input id="auto_play_audio" type="checkbox" checked /></input>
          <span>自动朗读角色消息</span>
        </label>
      </div>

      <div class="flex-container flexGap5" style="margin-bottom: 15px;">
        <label class="checkbox_label">
          <input id="auto_play_user" type="checkbox" /></input>
          <span>自动朗读用户消息</span>
        </label>
      </div>

      <hr style="margin: 15px 0; border-color: #444;">
</hr>
      </!-->
      <div style="margin-bottom: 15px;">
        <b>克隆音色功能</b>

        <div class="flex-container flexGap5" style="margin-top: 10px; margin-bottom: 10px;">
          <label for="clone_voice_name">音色名称：</label>
          <input id="clone_voice_name" type="text" class="text_pole wide100p" placeholder="仅英文字母、数字、下划线、连字符" /></input>
        </div>

        <div class="flex-container flexGap5" style="margin-bottom: 10px;">
          <label for="clone_voice_text">参考文本：</label>
          <input id="clone_voice_text" type="text" class="text_pole wide100p" placeholder="输入音频对应的文字内容" /></input>
        </div>

        <div class="flex-container flexGap5" style="margin-bottom: 10px;">
          <label for="clone_voice_audio">参考音频：</label>
          <input id="clone_voice_audio" type="file" accept="audio/*" style="flex: 1;" /></input>
        </div>

        <div class="flex-container flexGap5" style="margin-bottom: 10px;">
          <button id="upload_voice" class="menu_button">上传克隆音色</button>
          <button id="refresh_custom_voices" class="menu_button">刷新音色列表</button>
        </div>

        <div style="margin-top: 10px;">
          <label>已克隆的音色：</label>
          <div id="custom_voices_list" style="margin-top: 5px; max-height: 150px; overflow-y: auto;">
            <small>暂无自定义音色</small>
          </div>
        </div>
      </div>

      <hr style="margin: 15px 0; border-color: #444;">
</hr>
      </!-->
      <div style="margin-bottom: 15px;">
        <b>文本截取设置</b>

        <div class="flex-container flexGap5" style="margin-top: 10px; margin-bottom: 10px;">
          <label for="image_text_start">开始标记：</label>
          <input id="image_text_start" type="text" class="text_pole" style="width: 80px;" placeholder="（" /></input>
          <label for="image_text_end" style="margin-left: 20px;">结束标记：</label>
          <input id="image_text_end" type="text" class="text_pole" style="width: 80px;" placeholder="）" /></input>
        </div>
        <small style="color: #888;">设置后只朗读标记内的文本，留空则朗读全文</small>
      </div>

      <hr style="margin: 15px 0; border-color: #444;">
</hr>
      </!-->
      <div style="margin-bottom: 10px;">
        <b>TTS测试</b>

        <div class="flex-container flexGap5" style="margin-top: 10px; margin-bottom: 10px;">
          <input id="tts_test_text" type="text" class="text_pole wide100p" placeholder="你好，这是一个测试语音。" value="你好，这是一个测试语音。" /></input>
        </div>

        <div class="flex-container flexGap5">
          <button id="test_tts" class="menu_button">生成测试语音</button>
        </div>

        <div id="tts_output" style="margin-top: 10px;"></div>
      </div>

    </div>
  </div>
</div>

<style>
.siliconflow-extension-settings {
  margin: 10px 0;
}

.siliconflow-extension-settings .inline-drawer-header {
  cursor: pointer;
  padding: 10px;
  background: #2a2a2a;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.siliconflow-extension-settings .inline-drawer-header:hover {
  background: #3a3a3a;
}

.siliconflow-extension-settings .inline-drawer-content {
  padding: 15px;
  background: #1a1a1a;
  border-radius: 0 0 5px 5px;
}

.siliconflow-extension-settings .inline-drawer-icon {
  transition: transform 0.3s;
}

.siliconflow-extension-settings .inline-drawer-icon.down {
  transform: rotate(180deg);
}

.siliconflow-extension-settings label {
  min-width: 120px;
  white-space: nowrap;
}

.siliconflow-extension-settings .menu_button {
  padding: 5px 15px;
  cursor: pointer;
}

.siliconflow-extension-settings .custom-voice-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.siliconflow-extension-settings hr {
  border: none;
  border-top: 1px solid #444;
}

.siliconflow-extension-settings small {
  display: block;
  margin-top: 3px;
}

.siliconflow-extension-settings .checkbox_label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.siliconflow-extension-settings .checkbox_label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style>
