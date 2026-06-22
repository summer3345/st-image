(function () {
    const EXT_NAME = "image-gen-plugin";
    const CFG_KEY = "image-gen-plugin-cfg-v1";
    
    const state = {
        profiles: [],
        currentProfileId: null
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

    function makeBtn(prompt, msgEl, container) {
        const btn = document.createElement("button");
        btn.innerText = "🎨 生成配图";
        btn.className = "menu_button";
        btn.style.margin = "5px 0";
        btn.style.display = "inline-block"; // 确保按钮水平显示
        btn.style.verticalAlign = "middle"; // 垂直居中
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
                    const wrapper = document.createElement("div");
                    wrapper.style.marginTop = "10px";
                    
                    const image = document.createElement("img");
                    image.src = img;
                    image.style.maxWidth = "100%";
                    
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

    function parseImage(res) {
        try {
            if (res?.data?.[0]?.url) {
                return res.data[0].url;
            } else if (res?.choices?.[0]?.message?.content) {
                const regex = /!\[.*?\]\((.*?)\)/g;
                const match = regex.exec(res.choices[0].message.content);
                return match ? match[1] : null;
            }
            return null;
        } catch {
            return null;
        }
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

    function createUI() {
        const html = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>🎨 图片生成器</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <p>格式: <code>image###prompt###</code> (AI输出此格式即可生成按钮)</p>
                    
                    <div class="st-form-group">
                        <label>API 档位</label>
                        <select id="img-gen-profile-select">
                            ${state.profiles.map(p => 
                                `<option value="${p.id}" ${p.id === state.currentProfileId ? 'selected' : ''}>${p.name}</option>`
                            ).join('')}
                        </select>
                        <button id="img-gen-new-profile" class="menu_button">新建档位</button>
                        <button id="img-gen-delete-profile" class="menu_button">删除档位</button>
                    </div>

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
                    
                    <div style="margin-top: 10px; display: flex; gap: 5px;">
                        <input type="button" id="img-gen-test-connection" class="menu_button" value="测试连接" style="flex: 1;">
                        <input type="button" id="img-gen-save-profile" class="menu_button" value="保存配置" style="flex: 1;">
                    </div>
                </div>
            </div>
        `;

        $("#extensions_settings2").append(html);

        $("#extensions_settings2 .inline-drawer-toggle").last().on("click", function() {
            $(this).parent().toggleClass("inline-drawer-expanded");
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
        $("#img-gen-fetch-models").on("click", async () => {
            const url = $("#img-gen-url").val();
            const key = $("#img-gen-key").val();
            if (!url) return toastr.error("请先填写 API 地址");

            const $btn = $(this);
            $btn.val("拉取中...").prop("disabled", true);

            try {
                const res = await fetch(`${url}/v1/models`, {
                    method: "GET",
                    headers: { "Authorization": "Bearer " + key }
                }).then(r => r.json());

                const models = res?.data || [];
                if (models.length === 0) {
                    toastr.error("未拉取到模型，请检查地址和密钥");
                    return;
                }

                const $select = $("#img-gen-model");
                $select.empty();
                models.forEach(m => {
                    $select.append(`<option value="${m.id}">${m.id}</option>`);
                });

                toastr.success(`成功拉取 ${models.length} 个模型`);
            } catch (e) {
                toastr.error("拉取失败: " + e.message);
            } finally {
                $btn.val("拉取模型").prop("disabled", false);
            }
        });

        // 测试连接
        $("#img-gen-test-connection").on("click", async () => {
            const url = $("#img-gen-url").val();
            const key = $("#img-gen-key").val();
            if (!url) return toastr.error("请先填写 API 地址");

            try {
                const res = await fetch(`${url}/v1/models`, {
                    method: "GET",
                    headers: { "Authorization": "Bearer " + key }
                });
                toastr.success(res.ok ? "连接成功！" : "连接失败");
            } catch (e) {
                toastr.error("连接失败: " + e.message);
            }
        });

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

