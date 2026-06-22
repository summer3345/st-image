(function () {
    const CFG_KEY = "cg_generator_cfg_v1";
    const EXT_NAME = "cg-generator";
    const state = { configs: [], active: 0 };

    function ctx() { return SillyTavern.getContext(); }

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

    // 提取 prompt 并清理可能混入的 HTML 标签
    function extractPrompt(text) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = text;
        return tempDiv.innerText.trim();
    }

    function makeBtn(prompt, msgEl, container) {
        const btn = document.createElement("button");
        btn.innerText = "CG"; // 按钮文字缩短为 CG
        btn.className = "menu_button";
        btn.style.margin = "5px 0";
        
        const imgBox = document.createElement("div");
        imgBox.className = "cg-box";

        btn.onclick = async () => {
            const cfg = state.configs[state.active];
            if (!cfg) return toastr.error("No config! 请先在扩展面板配置API信息。");
            btn.innerText = "生成中...";
            btn.disabled = true;
            try {
                let res;
                if (cfg.protocol === "images") {
                    res = await fetch(cfg.url + "/v1/images/generations", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.key },
                        body: JSON.stringify({ model: cfg.model, prompt })
                    }).then(r => r.json());
                } else {
                    res = await fetch(cfg.url + "/v1/chat/completions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.key },
                        body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: prompt }] })
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
                    dl.onclick = () => download(img);

                    const del = document.createElement("button");
                    del.innerText = "🗑 删除";
                    del.className = "menu_button";
                    del.onclick = () => wrapper.remove();

                    wrapper.appendChild(image);
                    wrapper.appendChild(document.createElement("br"));
                    wrapper.appendChild(dl);
                    wrapper.appendChild(del);
                    imgBox.appendChild(wrapper);
                    saveToMessage(msgEl, img);
                } else {
                    toastr.error("生成失败，请检查控制台报错。");
                    console.error("CG API Response:", res);
                }
            } catch (e) {
                console.error(e);
                toastr.error("CG error: " + e.message);
            } finally {
                btn.innerText = "CG";
                btn.disabled = false;
            }
        };
        container.appendChild(btn);
        container.appendChild(imgBox);
    }

    function parseImage(res) {
        try {
            return (
                res?.data?.[0]?.url ||
                res?.data?.[0]?.b64_json ||
                res?.choices?.[0]?.message?.content?.[0]?.image_url ||
                null
            );
        } catch { return null; }
    }

    function download(url) {
        fetch(url)
            .then(r => r.blob())
            .then(b => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "cg.png";
                a.click();
            });
    }

    function saveToMessage(msgEl, img) {
        try {
            const c = ctx();
            const id = msgEl?.getAttribute("mesid");
            if (!c || !id) return;
            c.chat[id] = c.chat[id] || {};
            c.chat[id].extra = c.chat[id].extra || {};
            c.chat[id].extra.cgImages = c.chat[id].extra.cgImages || [];
            c.chat[id].extra.cgImages.push(img);
            c.saveChat?.();
        } catch (e) {}
    }

    // 扫描并将正文中的占位符替换为按钮
    function scan() {
        document.querySelectorAll(".mes").forEach(m => {
            if (m.dataset.cgDone) return;
            const mesText = m.querySelector(".mes_text");
            if (!mesText) return;

            // 直接检查 innerHTML 是否包含目标格式
            let html = mesText.innerHTML;
            if (!REG.test(html)) return;
            
            // 匹配到了，标记为已处理
            m.dataset.cgDone = "1";
            REG.lastIndex = 0; // 重置正则指针

            const prompts = [];
            // 将 image###...### 替换为占位 div
            const newHtml = html.replace(REG, (match, p1) => {
                const cleanPrompt = extractPrompt(p1);
                prompts.push(cleanPrompt);
                const idx = prompts.length - 1;
                return `<div class="cg-inline-container" data-cg-idx="${idx}"></div>`;
            });

            // 更新消息内容 HTML
            mesText.innerHTML = newHtml;

            // 给占位 div 填充按钮
            mesText.querySelectorAll(".cg-inline-container").forEach(container => {
                const idx = parseInt(container.getAttribute("data-cg-idx"));
                makeBtn(prompts[idx], m, container);
            });
        });
    }

    function createUI() {
        const cfg = state.configs[state.active] || {};
        const html = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>🎨 CG Generator 设置</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p>格式: <code>image###prompt###</code> (AI输出此格式即可生成按钮)</p>
                <label>API 地址</label>
                <input type="text" id="cg_url" class="text_pole" value="${cfg.url || ""}" placeholder="https://api.openai.com">
                <label>API 密钥</label>
                <input type="password" id="cg_key" class="text_pole" value="${cfg.key || ""}" placeholder="sk-...">
                <label>模型名称</label>
                <select id="cg_model" class="text_pole">
                    ${cfg.model ? `<option value="${cfg.model}">${cfg.model}</option>` : `<option value="">请先拉取模型</option>`}
                </select>
                <label>协议类型</label>
                <select id="cg_protocol" class="text_pole">
                    <option value="images" ${cfg.protocol === 'images' ? 'selected' : ''}>images (标准画图接口)</option>
                    <option value="chat" ${cfg.protocol === 'chat' ? 'selected' : ''}>chat (多模态对话接口)</option>
                </select>
                <div style="margin-top: 10px; display: flex; gap: 5px;">
                    <input type="button" id="cg_fetch_models_btn" class="menu_button" value="拉取模型" style="flex: 1;">
                    <input type="button" id="cg_save_btn" class="menu_button" value="保存配置" style="flex: 1;">
                </div>
            </div>
        </div>`;

        $("#extensions_settings2").append(html);

        // 绑定折叠面板点击事件 (只绑定最后一个，防止重复绑定其他插件的)
        $("#extensions_settings2 .inline-drawer-toggle").last().on("click", function() {
            $(this).parent().toggleClass("inline-drawer-expanded");
        });

        // 绑定拉取模型按钮
        $("#cg_fetch_models_btn").on("click", async function() {
            const url = $("#cg_url").val();
            const key = $("#cg_key").val();
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
                
                const $select = $("#cg_model");
                $select.empty();
                models.forEach(m => {
                    $select.append(`<option value="${m.id}">${m.id}</option>`);
                });
                
                // 如果之前有保存的模型，选中它
                if (cfg.model) {
                    $select.val(cfg.model);
                }
                toastr.success(`成功拉取 ${models.length} 个模型`);
            } catch (e) {
                toastr.error("拉取失败: " + e.message);
            } finally {
                $btn.val("拉取模型").prop("disabled", false);
            }
        });

        // 绑定保存按钮
        $("#cg_save_btn").on("click", function() {
            state.configs = [{
                protocol: $("#cg_protocol").val(),
                url: $("#cg_url").val(),
                key: $("#cg_key").val(),
                model: $("#cg_model").val()
            }];
            state.active = 0;
            saveCfg();
            toastr.success("CG Generator 配置已保存！");
        });
    }

    function init() {
        loadCfg();
        createUI();
        setInterval(scan, 1200);
        console.log("[CG Generator] 插件已加载");
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

