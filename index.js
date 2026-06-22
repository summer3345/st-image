(function () {
    const CFG_KEY = "cg_generator_cfg_v1";
    const EXT_NAME = "cg-generator";
    const state = { configs: [], active: 0 };

    function ctx() {
        return SillyTavern.getContext();
    }

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
    function extract(text) {
        const res = [];
        let m;
        while ((m = REG.exec(text))) res.push(m[1].trim());
        return res;
    }

    function makeBtn(prompt, msgEl, container) {
        const btn = document.createElement("button");
        btn.innerText = "? Generate CG";
        btn.className = "menu_button";
        btn.style.marginTop = "6px";
        const imgBox = document.createElement("div");
        imgBox.className = "cg-box";
        
        btn.onclick = async () => {
            const cfg = state.configs[state.active];
            if (!cfg) return toastr.error("No config! 请先在扩展面板配置API信息。");
            btn.innerText = "Generating...";
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
                    dl.innerText = "? Download";
                    dl.className = "menu_button";
                    dl.style.marginRight = "5px";
                    dl.onclick = () => download(img);
                    const del = document.createElement("button");
                    del.innerText = "? Delete";
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
                btn.innerText = "? Generate CG";
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

    function scan() {
        document.querySelectorAll(".mes").forEach(m => {
            if (m.dataset.cgDone) return;
            const text = m.querySelector(".mes_text")?.innerText || "";
            const prompts = extract(text);
            if (!prompts.length) return;
            m.dataset.cgDone = "1";
            const container = document.createElement("div");
            container.style.padding = "0 10px";
            prompts.forEach(p => makeBtn(p, m, container));
            m.appendChild(container);
        });
    }

    // --- 新增：参考标准插件规范编写的 UI 注入 ---
    function createUI() {
        const cfg = state.configs[state.active] || {};
        
        const html = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>? CG Generator 设置</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p>格式: <code>image###prompt###</code> (AI输出此格式即可生成按钮)</p>
                
                <div class="inline-drawer">
                    <div class="inline-drawer-toggle inline-drawer-header">
                        <b>API 配置</b>
                        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                    </div>
                    <div class="inline-drawer-content">
                        <label>API 地址</label>
                        <input type="text" id="cg_url" class="text_pole" value="${cfg.url || ""}" placeholder="https://api.openai.com">
                        
                        <label>API 密钥</label>
                        <input type="password" id="cg_key" class="text_pole" value="${cfg.key || ""}" placeholder="sk-...">
                        
                        <label>模型名称</label>
                        <input type="text" id="cg_model" class="text_pole" value="${cfg.model || ""}" placeholder="dall-e-3">
                        
                        <label>协议类型</label>
                        <select id="cg_protocol" class="text_pole">
                            <option value="images" ${cfg.protocol === 'images' ? 'selected' : ''}>images (标准画图接口)</option>
                            <option value="chat" ${cfg.protocol === 'chat' ? 'selected' : ''}>chat (多模态对话接口)</option>
                        </select>
                        
                        <div style="margin-top: 10px;">
                            <input type="button" id="cg_save_btn" class="menu_button" value="保存配置">
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        // 挂载到 ST 的扩展设置容器 2
        $("#extensions_settings2").append(html);

        // 绑定折叠面板点击事件
        $(".inline-drawer-toggle").on("click", function() {
            $(this).parent().toggleClass("inline-drawer-expanded");
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

    // 参考你提供的代码，使用 APP_READY 事件确保 ST 完全加载后再初始化
    const waitAndInit = setInterval(() => {
        if (typeof SillyTavern !== "undefined" && SillyTavern.getContext) {
            const c = SillyTavern.getContext();
            if (c.eventSource && c.event_types && c.event_types.APP_READY) {
                clearInterval(waitAndInit);
                c.eventSource.on(c.event_types.APP_READY, init);
            } else if (c.extensionSettings) {
                // 兼容旧版没有 APP_READY 的情况
                clearInterval(waitAndInit);
                init();
            }
        }
    }, 300);
})();


