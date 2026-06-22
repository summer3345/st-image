import { extension_settings, saveSettingsDebounced, eventSource, chat } from '../../../../script.js';

export class ImageGenPlugin {
  constructor() {
    this.pluginName = 'image-gen-plugin';
    this.settings = extension_settings[this.pluginName] || {
      profiles: [],
      currentProfileId: null
    };
    this.init();
  }

  init() {
    this.loadSettings();
    this.setupEventListeners();
    this.setupSettingsUI();
  }

  // 加载设置
  loadSettings() {
    if (!this.settings.profiles.length) {
      // 默认创建一个空档位
      this.settings.profiles.push({
        id: Date.now().toString(),
        name: 'Default Profile',
        url: '',
        key: '',
        model: '',
        type: 'images'
      });
      this.settings.currentProfileId = this.settings.profiles[0].id;
    }
  }

  // 设置事件监听
  setupEventListeners() {
    eventSource.on('message-rendered', this.handleMessageRendered.bind(this));
  }

  // 处理消息渲染（替换文本为按钮）
  handleMessageRendered(message) {
    const text = message.message;
    const regex = /image###(.*?)###/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const prompt = match[1];
      const button = document.createElement('button');
      button.className = 'img-gen-btn';
      button.textContent = '🎨 Generate Image';
      button.dataset.prompt = prompt;
      button.dataset.messageId = message.id;
      button.addEventListener('click', this.handleGenerateImage.bind(this));
      
      // 替换文本节点为按钮
      const textNode = message.element.querySelector('.message-text');
      textNode.innerHTML = textNode.innerHTML.replace(match[0], button.outerHTML);
    }
  }

  // 处理生图请求
  handleGenerateImage(event) {
    const button = event.target;
    const prompt = button.dataset.prompt;
    const profile = this.settings.profiles.find(p => p.id === this.settings.currentProfileId);
    
    if (!profile || !profile.url || !profile.key) {
      alert('Please configure API settings first!');
      return;
    }

    // 禁用按钮，显示加载状态
    button.disabled = true;
    button.textContent = 'Generating...';

    // 根据接口类型组装请求
    let requestBody, endpoint;
    if (profile.type === 'images') {
      endpoint = '/v1/images/generations';
      requestBody = { prompt: prompt, model: profile.model };
    } else {
      endpoint = '/v1/chat/completions';
      requestBody = { 
        model: profile.model, 
        messages: [{ role: 'user', content: prompt }],
        stream: false 
      };
    }

    fetch(`${profile.url}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${profile.key}`
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
    .then(data => {
      let imageUrl;
      
      if (profile.type === 'images') {
        imageUrl = data.data[0].url;
      } else {
        // 从聊天回复中提取图片URL（假设是Markdown格式）
        const regex = /!\[.*?\]\((.*?)\)/g;
        const match = regex.exec(data.choices[0].message.content);
        imageUrl = match ? match[1] : null;
      }

      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.className = 'generated-img';
        button.parentNode.insertBefore(img, button.nextSibling);
      } else {
        alert('Failed to generate image!');
      }

      // 恢复按钮状态
      button.disabled = false;
      button.textContent = '🎨 Generate Image';
    })
    .catch(error => {
      console.error('Image generation error:', error);
      alert('Request failed!');
      button.disabled = false;
      button.textContent = '🎨 Generate Image';
    });
  }

  // 设置界面UI逻辑
  setupSettingsUI() {
    const profileSelect = document.getElementById('api-profile-select');
    const newProfileBtn = document.getElementById('new-profile-btn');
    const deleteProfileBtn = document.getElementById('delete-profile-btn');
    const apiUrlInput = document.getElementById('api-url');
    const apiKeyInput = document.getElementById('api-key');
    const modelSelect = document.getElementById('api-model');
    const fetchModelsBtn = document.getElementById('fetch-models-btn');
    const testConnectionBtn = document.getElementById('test-connection-btn');
    const saveProfileBtn = document.getElementById('save-profile-btn');
    const apiTypeSelect = document.getElementById('api-type');

    // 更新档位下拉菜单
    this.updateProfileSelect();

    // 选择档位时填充配置
    profileSelect.addEventListener('change', (e) => {
      const profileId = e.target.value;
      const profile = this.settings.profiles.find(p => p.id === profileId);
      if (profile) {
        apiUrlInput.value = profile.url;
        apiKeyInput.value = profile.key;
        modelSelect.value = profile.model;
        apiTypeSelect.value = profile.type;
      }
    });

    // 新建档位
    newProfileBtn.addEventListener('click', () => {
      const newProfile = {
        id: Date.now().toString(),
        name: `Profile ${this.settings.profiles.length + 1}`,
        url: '',
        key: '',
        model: '',
        type: 'images'
      };
      this.settings.profiles.push(newProfile);
      this.settings.currentProfileId = newProfile.id;
      this.updateProfileSelect();
      this.saveSettings();
    });

    // 删除档位
    deleteProfileBtn.addEventListener('click', () => {
      const profileId = profileSelect.value;
      if (profileId && confirm('Delete this profile?')) {
        this.settings.profiles = this.settings.profiles.filter(p => p.id !== profileId);
        this.settings.currentProfileId = this.settings.profiles.length > 0 ? this.settings.profiles[0].id : null;
        this.updateProfileSelect();
        this.saveSettings();
      }
    });

    // 拉取模型列表
    fetchModelsBtn.addEventListener('click', () => {
      const url = apiUrlInput.value;
      const key = apiKeyInput.value;
      if (!url || !key) return;

      fetch(`${url}/v1/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${key}` }
      })
      .then(response => response.json())
      .then(data => {
        modelSelect.innerHTML = '';
        data.data.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          modelSelect.appendChild(option);
        });
      })
      .catch(error => {
        console.error('Fetch models error:', error);
        alert('Failed to fetch models!');
      });
    });

    // 测试连接
    testConnectionBtn.addEventListener('click', () => {
      const url = apiUrlInput.value;
      const key = apiKeyInput.value;
      if (!url || !key) return;

      fetch(`${url}/v1/models`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${key}` }
      })
      .then(response => {
        alert(response.ok ? 'Connection successful!' : 'Connection failed!');
      })
      .catch(error => {
        console.error('Test connection error:', error);
        alert('Connection failed!');
      });
    });

    // 保存当前档位配置
    saveProfileBtn.addEventListener('click', () => {
      const profileId = profileSelect.value;
      const profile = this.settings.profiles.find(p => p.id === profileId);
      if (profile) {
        profile.url = apiUrlInput.value;
        profile.key = apiKeyInput.value;
        profile.model = modelSelect.value;
        profile.type = apiTypeSelect.value;
        this.saveSettings();
        alert('Profile saved!');
      }
    });
  }

  // 更新档位下拉菜单
  updateProfileSelect() {
    const profileSelect = document.getElementById('api-profile-select');
    profileSelect.innerHTML = '';
    this.settings.profiles.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name;
      profileSelect.appendChild(option);
    });
    if (this.settings.currentProfileId) {
      profileSelect.value = this.settings.currentProfileId;
    }
  }

  // 保存设置
  saveSettings() {
    extension_settings[this.pluginName] = this.settings;
    saveSettingsDebounced();
  }
}

// 初始化插件
const plugin = new ImageGenPlugin();

