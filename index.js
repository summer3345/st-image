(function () {
    const EXT_NAME = "image-gen-plugin";
    const CFG_KEY = "image-gen-plugin-cfg-v1";
    
    const state = {
        profiles: [],
        currentProfileId: null,
        imageCache: {} // 添加图片缓存
    };

    function loadCfg() {
        try {
            const raw = localStorage.getItem(CFG_KEY);
            if (raw) Object.assign(state, JSON.parse(raw));
        } catch (e) {}
    }

    function saveCfg() {
        localStorage.setItem(CFG_KEY, JSON.stringify(state));
    }

    const REG = /image###([\s\S]*?)###/g;

    function extractPrompt(text) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text;
        return tempDiv.innerText.trim();
    }

    function parseImage(res) {
        try {
            // 1. 直接URL（优先处理）
            if (res?.data?.[0]?.url) {
                return res.data[0].url;
            }
            
            // 2. Base64编码（OpenAI格式）
            if (res?.data?.[0]?.b64_json) {
                const base64Data = res.data[0].b64_json;
                return `data:image/png;base64,${base64Data}`;
            }
            
            // 3. Base64编码（其他格式）
            if (res?.data?.[0]?.b64_image) {
                const base64Data = res.data[0].b64_image;
                return `data:image/png;base64,${base64Data}`;
            }
            
            // 4. Chat接口的Markdown格式
            if (res?.choices?.[0]?.message?.content) {
                const regex = /!\[.*?\]\((.*?)\)/g;
                const match = regex.exec(res.choices[0].message.content);
                return match ? match[1] : null;
            }
            
            return null;
        } catch {
            return null;
        }
    }

    function makeBtn(prompt, msgEl, container) {
        const btn = document.createElement("button");
        btn.innerText = "🎨 生成配图";
        btn.className = "menu_button";
        btn.style.margin = "5px 0";
        btn.style.display = "inline-block";
        btn.style.verticalAlign = "middle";
        const imgBox = document.createElement("div");
        imgBox.className = "img-gen-box";
        
        btn.onclick = async () => {
            const profile = state.profiles.find(p => p.id === state.currentProfileId);
            if (!profile || !profile.url || !profile.key) {
                toastr.error("请先在扩展面板配置API信息。");
                return;
            }

            btn.innerText = "生成中...";
            btn.disabled = true;

            try {
                let res;
                if (profile.type === "images") {
                    res = await fetch(profile.url + "/v1/images/generations", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + profile.key
                        },
                        body: JSON.stringify({
                            model: profile.model,
                            prompt: prompt
                        })
                    }).then(r => r.json());
                } else {
                    res = await fetch(profile.url + "/v1/chat/completions", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": "Bearer " + profile.key
                        },
                        body: JSON.stringify({
                            model: profile.model,
                            messages: [{ role: "user", content: prompt }],
                            stream: false
                        })
                    }).then(r => r.json());
                }

                const img = parseImage(res);
                if (img) {
                    // 检查缓存
                    if (!state.imageCache[img]) {
                        state.imageCache[img] = true;
                        saveCfg(); // 保存缓存状态
                    }
                    
                    const wrapper = document.createElement("div");
                    wrapper.style.marginTop = "10px";
                    
                    const image = document.createElement("img");
                    image.src = img;
                    image.style.maxWidth = "100%";
                    image.style.cursor = "pointer"; // 添加指针样式表示可点击
                    image.title = "点击查看原图";
                    
                    // 点击图片弹出原图
                    image.onclick = () => {
                        const modal = document.createElement("div");
                        modal.className = "img-modal";
                        modal.style.position = "fixed";
                        modal.style.top = "0";
                        modal.style.left = "0";
                        modal.style.width = "100%";
                        modal.style.height = "100%";
                        modal.style.backgroundColor = "rgba(0,0,0,0.8)";
                        modal.style.display = "flex";
                        modal.style.justifyContent = "center";
                        modal.style.alignItems = "center";
                        modal.style.zIndex = "9999";
                        
                        const modalImg = document.createElement("img");
                        modalImg.src = img;
                        modalImg.style.maxWidth = "90%";
                        modalImg.style.maxHeight = "90%";
                        modalImg.style.objectFit = "contain";
                        
                        const closeBtn = document.createElement("button");
                        closeBtn.innerText = "✕";
                        closeBtn.style.position = "absolute";
                        closeBtn.style.top = "20px";
                        closeBtn.style.right = "20px";
                        closeBtn.style.color = "white";
                        closeBtn.style.background = "none";
                        closeBtn.style.border = "none";
                        closeBtn.style.fontSize = "24px";
                        closeBtn.style.cursor = "pointer";
                        closeBtn.onclick = () => modal.remove();
                        
                        modal.appendChild(modalImg);
                        modal.appendChild(closeBtn);
                        document.body.appendChild(modal);
                        
                        // 点击背景关闭
                        modal.onclick = (e) => {
                            if (e.target === modal) modal.remove();
                        };
                    };
                    
                    const dl = document.createElement("button");
                    dl.innerText = "⬇ 下载";
                    dl.className = "menu_button";
                    dl.style.marginRight = "5px";
                    dl.style.display = "inline-block";
                    dl.style.verticalAlign = "middle";
                    dl.onclick = () => download(img);
                    
                    const del = document.createElement("button");
                    del.innerText = "🗑 删除";
                    del.className = "menu_button";
                    del.style.display = "inline-block";
                    del.style.verticalAlign = "middle";
                    del.onclick = () => {
                        wrapper.remove();
                    };
                    
                    wrapper.appendChild(image);
                    wrapper.appendChild(document.createElement("br"));
                    wrapper.appendChild(dl);
                    wrapper.appendChild(del);
                    imgBox.appendChild(wrapper);
                } else {
                    toastr.error("生成失败，请检查控制台报错。");
                    console.error("API Response:", res);
                }
            } catch (e) {
                console.error(e);
                toastr.error("请求失败: " + e.message);
            } finally {
                btn.innerText = "🎨 生成配图";
                btn.disabled = false;
            }
        };

        container.appendChild(btn);
        container.appendChild(imgBox);
    }

    function download(url) {
        fetch(url)
            .then(r => r.blob())
            .then(b => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "image.png";
                a.click();
            });
    }

    function scan() {
        document.querySelectorAll(".mes").forEach(m => {
            if (m.dataset.imgGenDone) return;
            
            const mesText = m.querySelector(".mes_text");
            if (!mesText) return;

            let html = mesText.innerHTML;
            if (!REG.test(html)) return;

            m.dataset.imgGenDone = "1";
            REG.lastIndex = 0;

            const prompts = [];
            const newHtml = html.replace(REG, (match, p1) => {
                const cleanPrompt = extractPrompt(p1);
                prompts.push(cleanPrompt);
                const idx = prompts.length - 1;
                return `<div class="img-gen-container" data-idx="${idx}"></div>`;
            });

            mesText.innerHTML = newHtml;
            
            mesText.querySelectorAll(".img-gen-container").forEach(container => {
                const idx = parseInt(container.getAttribute("data-idx"));
                makeBtn(prompts[idx], m, container);
            });
        });
    }

    function normalizeApiBase(base) {
        let url = (base || "").trim();
        if (!url) return "";
        while (url.length > 1 && url.charAt(url.length - 1) === "/") url = url.slice(0, -1);
        if (url.indexOf("/chat/completions") >= 0) url = url.replace(/\/chat\/completions\/?$/, "");
        if (url.indexOf("/models") >= 0) url = url.replace(/\/models\/?$/, "");
        if (!url.endsWith("/v1")) url += "/v1";
        return url;
    }

    async function fetchModels() {
        const profileId = $("#img-gen-profile-select").val();
        const profile = state.profiles.find(p => p.id === profileId);
        
        if (!profile || !profile.url) return alert("请先选择档位并填写 API 地址");
        
        const url = normalizeApiBase(profile.url) + "/models";
        try {
            $("#img-gen-model").empty().append('<option value="">加载中...</option>');
            const res = await fetch(url, {
                method: "GET",
                headers: profile.key ? { "Authorization": "Bearer " + profile.key } : {}
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = await res.json();
            const models = data.data ? data.data.map(m => m.id) : (data.models ? data.models.map(m => m.id) : []);
            
            $("#img-gen-model").empty().append('<option value="">请选择模型</option>');
            models.forEach(id => {
                $("#img-gen-model").append(`<option value="${id}">${id}</option>`);
            });
        } catch (e) {
            console.error("[ImageGen] Fetch models error:", e);
            alert("拉取模型失败: " + e.message);
        }
    }

    async function testConnection() {
        const profileId = $("#img-gen-profile-select").val();
        const profile = state.profiles.find(p => p.id === profileId);
        
        if (!profile || !profile.url) return alert("请先选择档位并填写 API 地址");
        
        try {
            const url = normalizeApiBase(profile.url) + "/models";
            const res = await fetch(url, {
                method: "GET",
                headers: profile.key ? { "Authorization": "Bearer " + profile.key } : {}
            });
            alert(res.ok ? "连接成功！" : "连接失败");
        } catch (e) {
            alert("连接失败: " + e.message);
        }
    }

    function createUI() {
        const html = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🎨 图片生成器</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content img-gen-panel">
                    <div style="margin-bottom: 10px;">
                        <label class="checkbox_label">
                            <input type="checkbox" id="img-gen-enabled" ${state.enabled ? 'checked' : ''}>
                            <span>启用图片生成功能</span>
                        </label>
                    </div>
                    
                    <div class="inline-drawer">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b>API 档位管理</b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div class="inline-drawer-content img-gen-section">
                            <div class="st-form-group">
                                <label>当前档位</label>
                                <select id="img-gen-profile-select">
                                    ${state.profiles.map(p => 
                                        `<option value="${p.id}" ${p.id === state.currentProfileId ? 'selected' : ''}>${p.name}</option>`
                                    ).join('')}
                                </select>
                                <button id="img-gen-new-profile" class="menu_button">新建档位</button>
                                <button id="img-gen-delete-profile" class="menu_button">删除档位</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="inline-drawer">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b>API 配置</b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div class="inline-drawer-content img-gen-section">
                            <div class="st-form-group">
                                <label>API 地址</label>
                                <input type="text" id="img-gen-url" class="text_pole" placeholder="https://api.example.com/v1">
                            </div>
                            
                            <div class="st-form-group">
                                <label>API 密钥</label>
                                <input type="password" id="img-gen-key" class="text_pole" placeholder="sk-...">
                            </div>
                            
                            <div class="st-form-group">
                                <label>模型名称</label>
                                <select id="img-gen-model" class="text_pole">
                                    <option value="">请先拉取模型</option>
                                </select>
                                <button id="img-gen-fetch-models" class="menu_button">拉取模型</button>
                            </div>
                            
                            <div class="st-form-group">
                                <label>接口类型</label>
                                <select id="img-gen-type" class="text_pole">
                                    <option value="images">images (标准画图接口)</option>
                                    <option value="chat">chat (多模态对话接口)</option>
                                </select>
                            </div>
                            
                            <div class="st-form-group">
                                <button id="img-gen-test-connection" class="menu_button">测试连接</button>
                                <button id="img-gen-save-profile" class="menu_button">保存配置</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="inline-drawer">
                        <div class="inline-drawer-toggle inline-drawer-header">
                            <b>生成设置</b>
                            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                        </div>
                        <div class="inline-drawer-content img-gen-section">
                            <p>格式: <code>image###prompt###</code> (AI输出此格式即可生成按钮)</p>
                            <div style="margin-top: 10px;">
                                <button id="img-gen-run-scan" class="menu_button">立即扫描当前聊天</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        $("#extensions_settings2").append(html);

        $(".inline-drawer-toggle").on("click", function() {
            $(this).parent().toggleClass("inline-drawer-expanded");
        });

        // 启用/禁用功能
        $("#img-gen-enabled").on("change", function() {
            state.enabled = this.checked;
            saveCfg();
        });

        // 档位选择变化
        $("#img-gen-profile-select").on("change", (e) => {
            const profileId = e.target.value;
            const profile = state.profiles.find(p => p.id === profileId);
            if (profile) {
                $("#img-gen-url").val(profile.url);
                $("#img-gen-key").val(profile.key);
                $("#img-gen-model").val(profile.model);
                $("#img-gen-type").val(profile.type);
            }
        });

        // 新建档位
        $("#img-gen-new-profile").on("click", () => {
            const newProfile = {
                id: Date.now().toString(),
                name: `档位 ${state.profiles.length + 1}`,
                url: "",
                key: "",
                model: "",
                type: "images"
            };
            state.profiles.push(newProfile);
            state.currentProfileId = newProfile.id;
            updateProfileSelect();
            saveCfg();
            toastr.success("新档位已创建");
        });

        // 删除档位
        $("#img-gen-delete-profile").on("click", () => {
            const profileId = $("#img-gen-profile-select").val();
            if (profileId && confirm("确定要删除这个档位吗？")) {
                state.profiles = state.profiles.filter(p => p.id !== profileId);
                state.currentProfileId = state.profiles.length > 0 ? state.profiles[0].id : null;
                updateProfileSelect();
                saveCfg();
                toastr.success("档位已删除");
            }
        });

        // 拉取模型
        $("#img-gen-fetch-models").on("click", fetchModels);

        // 测试连接
        $("#img-gen-test-connection").on("click", testConnection);

        // 保存配置
        $("#img-gen-save-profile").on("click", () => {
            const profileId = $("#img-gen-profile-select").val();
            const profile = state.profiles.find(p => p.id === profileId);
            
            if (profile) {
                profile.url = $("#img-gen-url").val();
                profile.key = $("#img-gen-key").val();
                profile.model = $("#img-gen-model").val();
                profile.type = $("#img-gen-type").val();
                
                saveCfg();
                toastr.success("配置已保存");
            }
        });

        // 立即扫描聊天
        $("#img-gen-run-scan").on("click", () => {
            scan();
        });
    }

    function updateProfileSelect() {
        const $select = $("#img-gen-profile-select");
        $select.empty();
        
        state.profiles.forEach(profile => {
            $select.append(`<option value="${profile.id}">${profile.name}</option>`);
        });
        
        if (state.currentProfileId) {
            $select.val(state.currentProfileId);
        }
    }

    function init() {
        loadCfg();
        createUI();
        updateProfileSelect();
        setInterval(scan, 1200);
        console.log("[图片生成器] 插件已加载");
    }

    const waitAndInit = setInterval(() => {
        if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
            const c = SillyTavern.getContext();
            if (c.eventSource && c.event_types && c.event_types.APP_READY) {
                clearInterval(waitAndInit);
                c.eventSource.on(c.event_types.APP_READY, init);
            } else if (c.extensionSettings) {
                clearInterval(waitAndInit);
                init();
            }
        }
    }, 300);
})();

