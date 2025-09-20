/* Minimal ChatGPT-like client using OpenAI API via fetch */
(function() {
    "use strict";

    const STORAGE_KEYS = {
        apiKey: "chat_api_key",
        model: "chat_model",
        history: "chat_history",
        theme: "taskManagerTheme"
    };

    function safelyParseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }

    const Theme = {
        get() {
            const saved = localStorage.getItem(STORAGE_KEYS.theme);
            if (saved) return saved;
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        },
        apply(theme) {
            document.documentElement.setAttribute("data-theme", theme);
            const icon = document.getElementById("themeIcon");
            if (icon) icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
        },
        toggle() {
            const next = Theme.get() === "light" ? "dark" : "light";
            localStorage.setItem(STORAGE_KEYS.theme, next);
            Theme.apply(next);
        }
    };

    const Chat = {
        messages: [],
        load() {
            this.messages = safelyParseJson(localStorage.getItem(STORAGE_KEYS.history), []);
            if (!Array.isArray(this.messages)) this.messages = [];
        },
        save() { localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(this.messages)); },
        append(role, content) { this.messages.push({ role, content, ts: Date.now() }); this.save(); }
    };

    function renderMessages(listEl, messages) {
        listEl.innerHTML = messages.map(m => `
            <div class="chat-msg ${m.role}">
                <div class="chat-bubble">${escapeHtml(m.content)}</div>
            </div>
        `).join("");
        listEl.scrollTop = listEl.scrollHeight;
    }

    function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }

    async function sendToOpenAI(apiKey, model, messages) {
        const url = "https://api.openai.com/v1/chat/completions";
        const res = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages: messages.map(m => ({ role: m.role, content: m.content })) })
        });
        if (!res.ok) {
            const msg = await res.text();
            throw new Error(`API error ${res.status}: ${msg}`);
        }
        const data = await res.json();
        const choice = data.choices && data.choices[0];
        const content = choice?.message?.content || "(No response)";
        return content;
    }

    document.addEventListener('DOMContentLoaded', () => {
        Theme.apply(Theme.get());
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.addEventListener('click', Theme.toggle);

        const messagesEl = document.getElementById('chatMessages');
        const inputEl = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const apiBtn = document.getElementById('openApiKeyModal');
        const modal = document.getElementById('apiKeyModal');
        const closeModalBtn = document.getElementById('closeApiKeyModal');
        const apiKeyInput = document.getElementById('apiKeyInput');
        const modelSelect = document.getElementById('modelSelect');
        const saveApiBtn = document.getElementById('saveApiSettings');
        const clearBtn = document.getElementById('clearHistory');

        Chat.load();
        const storedKey = localStorage.getItem(STORAGE_KEYS.apiKey) || '';
        const storedModel = localStorage.getItem(STORAGE_KEYS.model) || 'gpt-4o-mini';
        apiKeyInput.value = storedKey;
        modelSelect.value = storedModel;
        renderMessages(messagesEl, Chat.messages);

        function openModal() { modal.removeAttribute('hidden'); }
        function closeModal() { modal.setAttribute('hidden', ''); }
        apiBtn.addEventListener('click', openModal);
        closeModalBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

        saveApiBtn.addEventListener('click', () => {
            localStorage.setItem(STORAGE_KEYS.apiKey, apiKeyInput.value.trim());
            localStorage.setItem(STORAGE_KEYS.model, modelSelect.value);
            closeModal();
        });

        clearBtn.addEventListener('click', () => {
            Chat.messages = [];
            Chat.save();
            renderMessages(messagesEl, Chat.messages);
        });

        function resizeTextarea() {
            inputEl.style.height = 'auto';
            inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
        }
        inputEl.addEventListener('input', resizeTextarea);
        resizeTextarea();

        async function handleSend() {
            const text = inputEl.value.trim();
            if (!text) return;
            inputEl.value = '';
            resizeTextarea();
            Chat.append('user', text);
            renderMessages(messagesEl, Chat.messages);

            const apiKey = localStorage.getItem(STORAGE_KEYS.apiKey);
            const model = localStorage.getItem(STORAGE_KEYS.model) || 'gpt-4o-mini';
            if (!apiKey) {
                Chat.append('assistant', 'Please set your API key in the API dialog.');
                renderMessages(messagesEl, Chat.messages);
                return;
            }

            try {
                const reply = await sendToOpenAI(apiKey, model, Chat.messages);
                Chat.append('assistant', reply);
                renderMessages(messagesEl, Chat.messages);
            } catch (err) {
                Chat.append('assistant', `Error: ${err.message}`);
                renderMessages(messagesEl, Chat.messages);
            }
        }

        sendBtn.addEventListener('click', handleSend);
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
        });
    });
})();


