(function () {
    const CFG_KEY = "cg_generator_cfg_v1";
    const state = { configs: [], active: 0 };

    function loadCfg() {
        try {
            const raw = localStorage.getItem(CFG_KEY);
            if (raw) Object.assign(state, JSON.parse(raw));
        } catch (e) {}
    }

    function saveCfg() {
        localStorage.setItem(CFG_KEY, JSON.stringify(state));
    }

    function getContext() {
        return window.SillyTavern?.getContext?.();
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
        btn.innerText = " Generate CG";
        btn.style.marginTop = "6px";
        const imgBox = document.createElement("div");
        imgBox.className = "cg-box";
        
        btn.onclick = async () => {
            const cfg = state.configs[state.active];
            if (!cfg) return alert("No config! API");
            btn.innerText = "Generating...";
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
                    const image = document.createElement("img");
                    image.src = img;
                    image.style.maxWidth = "100%";
                    const dl = document.createElement("button");
                    dl.innerText = " Download";
                    dl.onclick = () => download(img);
                    const del = document.createElement("button");
                    del.innerText = " Delete";
                    del.onclick = () => wrapper.remove();
                    wrapper.appendChild(image);
                    wrapper.appendChild(dl);
                    wrapper.appendChild(del);
                    imgBox.appendChild(wrapper);
                    saveToMessage(msgEl, img);
                } else {
                    alert("API");
                    console.error("CG API Response:", res);
                }
            } catch (e) {
                console.error(e);
                alert("CG error: " + e.message);
            } finally {
                btn.innerText = " Generate CG";
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
            const ctx = getContext();
            const id = msgEl?.getAttribute("mesid");
            if (!ctx || !id) return;
            ctx.chat[id] = ctx.chat[id] || {};
            ctx.chat[id].extra = ctx.chat[id].extra || {};
            ctx.chat[id].extra.cgImages = ctx.chat[id].extra.cgImages || [];
            ctx.chat[id].extra.cgImages.push(img);
            ctx.saveChat?.();
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
            prompts.forEach(p => makeBtn(p, m, container));
            m.appendChild(container);
        });
    }

    // ---  ST  ---
    function injectSettingsUI() {
        const extSettings = document.getElementById("extensions_settings");
        if (!extSettings) {
            //  ST 1
            setTimeout(injectSettingsUI, 1000);
            return;
        }

        const html = `
        <div class="cg-generator-extension" style="border-top: 1px solid #ccc; margin-top: 10px; padding-top: 10px;">
            <h3>CG Generator</h3> 
            <p>v0.1.1 | Format: image###prompt###</p>
            <p>Configs stored in localStorage.</p>
            
            <label>API URL:</label><br>
            <input id="cg_url" class="text_pole" style="width:100%; margin-bottom:5px;" placeholder="https://api.example.com"><br>
            
            <label>API Key:</label><br>
            <input id="cg_key" type="password" class="text_pole" style="width:100%; margin-bottom:5px;" placeholder="sk-..."><br>
            
            <label>Model:</label><br>
            <input id="cg_model" class="text_pole" style="width:100%; margin-bottom:5px;" placeholder="dall-e-3"><br>
            
            <label>Protocol:</label><br>
            <select id="cg_protocol" class="text_pole" style="width:100%; margin-bottom:10px;">
                <option value="images">images ()</option>
                <option value="chat">chat ()</option>
            </select><br>
            
            <button id="cg_save_btn" class="menu_button"></button>
        </div>`;
        
        extSettings.insertAdjacentHTML('beforeend', html);

        // 
        const cfg = state.configs[state.active] || {};
        document.getElementById("cg_url").value = cfg.url || "";
        document.getElementById("cg_key").value = cfg.key || "";
        document.getElementById("cg_model").value = cfg.model || "";
        document.getElementById("cg_protocol").value = cfg.protocol || "images";

        // 
        document.getElementById("cg_save_btn").onclick = () => {
            state.configs = [{
                protocol: document.getElementById("cg_protocol").value,
                url: document.getElementById("cg_url").value,
                key: document.getElementById("cg_key").value,
                model: document.getElementById("cg_model").value
            }];
            state.active = 0;
            saveCfg();
            alert("CG Generator ");
        };
    }

    function init() {
        loadCfg();
        injectSettingsUI(); //  UI
        setInterval(scan, 1200);
    }

    init();
})();

