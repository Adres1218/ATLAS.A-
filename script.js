// State
let config = {
    groqApiKey: (typeof ATLAS_CONFIG !== 'undefined' ? ATLAS_CONFIG.groqApiKey : '') || localStorage.getItem('groqApiKey') || '',
    systemPrompt: (typeof ATLAS_CONFIG !== 'undefined' ? ATLAS_CONFIG.systemPrompt : '') || localStorage.getItem('systemPrompt') || 'Sen Atlas AI yapay zekasısın. Türkçe konuşuyorsun.'
};

let currentView = 'chat';
let chatHistory = [];
let isGenerating = false;
let uploadedImage = null;

// DOM Elements
const messagesContainer = document.getElementById('messagesContainer');
const artGallery = document.getElementById('artGallery');
const userInput = document.getElementById('userInput');

// Init
function init() {
    const autoLogin = (typeof ATLAS_CONFIG !== 'undefined' ? ATLAS_CONFIG.autoLogin : false);
    if (autoLogin || localStorage.getItem('atlas_logged_in') === 'true') {
        const login = document.getElementById('loginScreen');
        if (login) login.remove();
    }
}

function handleLogin() {
    localStorage.setItem('atlas_logged_in', 'true');
    const login = document.getElementById('loginScreen');
    if (login) {
        login.style.opacity = '0';
        setTimeout(() => login.remove(), 500);
    }
}

function switchView(view) {
    currentView = view;
    const chatView = document.getElementById('chatView');
    const artView = document.getElementById('artView');
    const title = document.getElementById('viewTitle');
    
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    if (view === 'chat') {
        chatView?.classList.remove('hidden');
        artView?.classList.add('hidden');
        document.getElementById('btnChat')?.classList.add('active');
        if (title) title.innerText = 'Sohbet';
        userInput.placeholder = 'Mesajınızı yazın...';
    } else {
        chatView?.classList.add('hidden');
        artView?.classList.remove('hidden');
        document.getElementById('btnArt')?.classList.add('active');
        if (title) title.innerText = 'Görsel';
        userInput.placeholder = 'Hayalinizdeki görseli tarif edin...';
    }
}

function autoResize(t) { 
    t.style.height = 'auto'; 
    t.style.height = Math.min(t.scrollHeight, 180) + 'px'; 
}

function handleKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }

function handleSend() {
    if (isGenerating) return;
    const text = userInput.value.trim();
    if (!text && !uploadedImage) return;

    if (currentView === 'chat') {
        const imgTriggers = ['resim yap', 'görsel oluştur', 'fotoğraf yap', 'çiz', 'image', 'picture', 'draw', 'generate image'];
        const wantsImage = text.startsWith('/image') || text.startsWith('/img') || imgTriggers.some(t => text.toLowerCase().includes(t));
        
        if (wantsImage) {
            appendMessage('user', text);
            userInput.value = ''; autoResize(userInput);
            
            // Redirect message instead of generation
            const redirectDiv = document.createElement('div');
            redirectDiv.className = 'message ai';
            redirectDiv.innerHTML = `
                <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
                <div class="message-content">
                    <p>Şu anda burada üretim aşaması yok, şu siteye giderseniz buradan üretime devam ettirilecek:</p>
                    <div style="margin-top: 15px;">
                        <a href="https://alikayrakucul-yapay.hf.space" target="_blank" class="save-btn" style="display: inline-block; text-decoration: none; background: var(--accent); color: white; padding: 10px 20px; border-radius: 12px; font-weight: 600;">
                            <i class="fa-solid fa-wand-magic-sparkles"></i> Görsel Oluşturma Merkezine Git
                        </a>
                    </div>
                </div>
            `;
            messagesContainer.appendChild(redirectDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
            sendMessage(text);
        }
    } else {
        userInput.value = ''; autoResize(userInput);
        
        // Show redirect card in the gallery
        const card = document.createElement('div');
        card.className = 'art-card loaded';
        card.style.padding = '30px';
        card.style.textAlign = 'center';
        card.innerHTML = `
            <div style="font-size:3rem; margin-bottom:20px; color:var(--accent);"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
            <h3 style="margin-bottom:15px;">"${text}"</h3>
            <p style="color:var(--text-dim); margin-bottom:20px;">Şu anda burada üretim aşaması yok, aşağıdaki siteye giderek üretime devam edebilirsiniz.</p>
            <a href="https://alikayrakucul-yapay.hf.space" target="_blank" class="save-btn" style="display: inline-block; text-decoration: none; background: var(--accent); color: white; padding: 12px 25px; border-radius: 12px; font-weight: 600;">
                Görsel Oluşturma Merkezine Git
            </a>
        `;
        artGallery.prepend(card);
    }
}

async function processImageRequest(prompt) {
    isGenerating = true;
    showTyping();
    
    try {
        // Step 1: Enhance prompt
        try {
            const enhanced = await enhancePrompt(prompt);
            await generateImage(enhanced || prompt, prompt);
        } catch (e) {
            await generateImage(prompt, prompt);
        }
    } catch (e) {
        hideTyping();
        appendMessage('ai', 'Bir sorun oluştu: ' + e.message);
    } finally {
        isGenerating = false;
    }
}

async function enhancePrompt(userPrompt) {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system', 
                        content: 'You are a professional stable diffusion prompt engineer. Convert the user prompt into a highly detailed, cinematic, and photorealistic English prompt. Focus on lighting, texture, camera angle, and artistic style. Only return the enhanced prompt text, nothing else. If the user wants a specific format like square or rectangle, include that in the description.'
                    },
                    {role: 'user', content: userPrompt}
                ]
            })
        });
        const data = await res.json();
        return data.choices[0].message.content;
    } catch (e) {
        return userPrompt; // Fallback to original
    }
}

async function sendMessage(text) {
    appendMessage('user', text);
    userInput.value = ''; autoResize(userInput);
    
    isGenerating = true;
    showTyping();
    
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${config.groqApiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: uploadedImage ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile',
                messages: [{role: 'system', content: config.systemPrompt}, ...chatHistory, {role: 'user', content: text}]
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error("Şu anda bağlantı hatası var");
        const reply = data.choices[0].message.content;
        hideTyping();
        await appendTypewriterMessage('ai', reply);
        chatHistory.push({role: 'assistant', content: reply});
    } catch (e) { 
        hideTyping(); 
        appendErrorMessage('ai', 'Şu anda bağlantı hatası var. Lütfen API anahtarınızı ve internetinizi kontrol edin.'); 
    } finally { 
        isGenerating = false; 
    }
}

async function generateImage(enhancedPrompt, originalPrompt) {
    let card = null;
    let chatMsg = null;

    if (currentView === 'art') {
        const welcome = artGallery.querySelector('.art-welcome');
        if (welcome) welcome.remove();
        userInput.value = ''; autoResize(userInput);
        
        card = document.createElement('div');
        card.className = 'art-card';
        card.innerHTML = `
            <div class="loading-spinner" style="padding:100px; text-align:center; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                <div style="font-size:3rem; margin-bottom:20px; animation: spin 2s infinite linear; color:var(--accent);">⚡</div>
                <p style="font-weight:700; font-size:1.2rem; background:var(--grad); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Sanat Eseri İşleniyor</p>
                <p class="loading-text" style="font-size:0.9rem; color:var(--text-dim); margin-top:10px;">Atlas AI Motoru Çalışıyor... (0 sn.)</p>
            </div>
        `;
        artGallery.prepend(card);
        // Wake up call for the space
        try { await fetch('https://alikayrakucul-yapay.hf.space/config', { method: 'GET' }); } catch(e) {}
        
        // Create a persistent message for chat
        chatMsg = appendLoadingMessage(`**"${originalPrompt}"** için sanat eseri oluşturuluyor...`);
    }

    let imageUrl = '';
    let seconds = 0;
    const timer = setInterval(() => {
        seconds++;
        const statusText = (chatMsg || card)?.querySelector('.loading-text');
        if (statusText) statusText.innerText = (chatMsg ? `Görsel Hazırlanıyor... (${seconds} sn.)` : `Atlas AI Motoru Çalışıyor... (${seconds} sn.)`);
    }, 1000);

    try {
        const hfUrl = 'https://alikayrakucul-yapay.hf.space';
        const hfToken = (typeof ATLAS_CONFIG !== 'undefined' ? ATLAS_CONFIG.hfToken : '') || '';
        
        const artStyle = document.getElementById('artStyle')?.value || '';
        const finalPrompt = artStyle ? `${enhancedPrompt}, ${artStyle}` : enhancedPrompt;

        // Strategy 1: User Requested Endpoint (/run/predict) - PRIMARY
        const payloads = [
            { data: [finalPrompt] },
            { data: [finalPrompt, "low quality, blurry, distorted", 7.5, 30] }
        ];
        
        for (const payload of payloads) {
            try {
                const res = await fetch(`${hfUrl}/run/predict`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...(hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {}) },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const d = await res.json();
                    const o = d.data?.[0];
                    if (o) {
                        imageUrl = typeof o === 'string' ? (o.startsWith('http') ? o : `${hfUrl}/file=${o}`) : (o.url || o.image?.url);
                        if (imageUrl) break;
                    }
                }
            } catch (e) { console.error("Primary Predict failed:", e); }
        }

        // Strategy 2: Gradio Call API (Fallback)
        if (!imageUrl) {
            const callEndpoints = ['/gradio_api/call/generate_fn', '/call/generate_fn'];
            for (const cep of callEndpoints) {
                try {
                    const params = [finalPrompt, "low quality, blurry, distorted", 7.5, 30]; 
                    const eventRes = await fetch(`${hfUrl}${cep}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(hfToken ? { 'Authorization': `Bearer ${hfToken}` } : {}) },
                        body: JSON.stringify({ data: params })
                    });
                    if (eventRes.ok) {
                        const d = await eventRes.json();
                        if (d.event_id) {
                            imageUrl = await listenToSSE(`${hfUrl}${cep}/${d.event_id}`, hfUrl, hfToken);
                            if (imageUrl) break;
                        }
                    }
                } catch (err) { console.error("Call fallback failed:", err); }
            }
        }

        // Strategy 3: Pollinations (Higher Quality Fallback - Ultra Fast)
        if (!imageUrl) {
            const safePrompt = originalPrompt.substring(0, 300).replace(/[^\w\s]/gi, ' ');
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
        }
        
        if (currentView === 'art' && card) {
            const escapedOriginal = originalPrompt.replace(/'/g, "\\'");
            card.innerHTML = `
                <div class="art-actions">
                    <div class="art-action-btn" onclick="downloadImage('${imageUrl}', '${escapedOriginal}')"><i class="fa-solid fa-download"></i></div>
                </div>
                <img src="${imageUrl}" crossorigin="anonymous" 
                    onload="this.parentElement.classList.add('loaded')" 
                    onerror="this.src='https://via.placeholder.com/1024?text=Resim+Yuklenemedi'; this.parentElement.classList.add('loaded')">
                <div style="padding:20px;">
                    <p style="font-weight:600; font-size:0.9rem;">${originalPrompt}</p>
                    <p style="font-size:0.75rem; color:var(--text-dim); margin-top:5px;">${enhancedPrompt.substring(0, 150)}...</p>
                </div>
            `;
        } else if (chatMsg) {
            const escapedOriginal = originalPrompt.replace(/'/g, "\\'");
            // Update the chat message with the actual image
            chatMsg.innerHTML = `
                <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
                <div class="message-content">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <p style="font-weight:600;">"${originalPrompt}" hazır!</p>
                        <button class="icon-btn" onclick="downloadImage('${imageUrl}', '${escapedOriginal}')" style="font-size:1rem; color:var(--accent);">
                            <i class="fa-solid fa-download"></i> İndir
                        </button>
                    </div>
                    <img src="${imageUrl}" crossorigin="anonymous" 
                        onload="messagesContainer.scrollTop = messagesContainer.scrollHeight"
                        onerror="this.src='https://via.placeholder.com/512?text=Gorsel+Hatasi'"
                        style="width:100%; border-radius:16px; display:block; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                    <p style="font-size:0.8rem; color:var(--text-dim); margin-top:10px; font-style:italic;">${enhancedPrompt.substring(0, 100)}...</p>
                </div>
            `;
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    } catch (e) { 
        if (card) card.remove();
        if (chatMsg) {
            chatMsg.innerHTML = `
                <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
                <div class="message-content" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.05);">
                    <p style="color:#ef4444; font-weight:600;">Şu anda bağlantı hatası var. Görsel oluşturulamadı.</p>
                    <button class="save-btn" onclick="handleSend()" style="margin-top:10px; background:#ef4444; padding:8px 15px; font-size:0.8rem;">Tekrar Dene</button>
                </div>
            `;
        }
    } finally {
        clearInterval(timer);
        isGenerating = false;
    }
}

function appendLoadingMessage(text) {
    const div = document.createElement('div');
    div.className = 'message ai';
    div.innerHTML = `
        <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
        <div class="message-content">
            <div class="loading-spinner-container" style="display:flex; flex-direction:column; align-items:center; padding:20px;">
                <div class="premium-spinner" style="width:40px; height:40px; border:4px solid var(--accent); border-top:4px solid transparent; border-radius:50%; animation: spin 1s linear infinite;"></div>
                <p class="loading-text" style="margin-top:15px; font-weight:600; color:var(--accent);">Görsel Hazırlanıyor... (0 sn.)</p>
                <p style="font-size:0.8rem; color:var(--text-dim); margin-top:5px;">Lütfen bekleyin, bu işlem 1-2 dakika sürebilir.</p>
            </div>
        </div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    return div;
}

async function appendTypewriterMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="avatar">${role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-bolt"></i>'}</div>
        <div class="message-content"></div>
    `;
    messagesContainer.appendChild(div);
    const contentDiv = div.querySelector('.message-content');
    
    // Typewriter effect
    const words = content.split(' ');
    for (let i = 0; i < words.length; i++) {
        contentDiv.innerHTML = marked.parse(words.slice(0, i + 1).join(' '));
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        await new Promise(r => setTimeout(r, 30));
    }
}

function appendErrorMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
        <div class="message-content" style="border-color: #ef4444; background: rgba(239, 68, 68, 0.05);">
            <p style="color:#ef4444; font-weight:600;">${content}</p>
            <button class="save-btn" onclick="handleSend()" style="margin-top:10px; background:#ef4444; padding:8px 15px; font-size:0.8rem;">Tekrar Dene</button>
        </div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendMessage(role, content, isImg = false) {
    const welcome = document.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
        <div class="avatar">${role === 'user' ? '<i class="fa-solid fa-user"></i>' : '<i class="fa-solid fa-bolt"></i>'}</div>
        <div class="message-content">${isImg ? `<img src="${content}" style="width:100%; border-radius:16px;">` : marked.parse(content)}</div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTyping() {
    const div = document.createElement('div');
    div.id = 'typing'; div.className = 'message ai';
    div.innerHTML = `
        <div class="avatar"><i class="fa-solid fa-bolt"></i></div>
        <div class="message-content">Atlas AI düşünüyor...</div>
    `;
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTyping() { document.getElementById('typing')?.remove(); }

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => { 
            uploadedImage = ev.target.result; 
            alert('Görsel başarıyla yüklendi. Şimdi bu görsel hakkında soru sorabilirsiniz.'); 
        };
        reader.readAsDataURL(file);
    }
}

function toggleSettings() { document.getElementById('settingsModal').classList.toggle('hidden'); }
function saveSettings() {
    config.groqApiKey = document.getElementById('groqApiKey').value.trim();
    localStorage.setItem('groqApiKey', config.groqApiKey);
    toggleSettings();
}

async function listenToSSE(url, baseUrl, token) {
    return new Promise((resolve, reject) => {
        const es = new EventSource(url);
        es.onmessage = e => {
            const d = JSON.parse(e.data);
            if (d.msg === 'process_completed') {
                es.close();
                const o = d.output.data[0];
                resolve(typeof o === 'string' ? (o.startsWith('http') ? o : `${baseUrl}/file=${o}`) : (o.url || o.image?.url));
            }
        };
        es.onerror = () => { es.close(); reject(new Error("Bağlantı Hatası")); };
        setTimeout(() => { es.close(); reject(new Error("Sunucu Yanıt Vermedi (Zaman Aşımı)")); }, 300000); // 5 Minutes
    });
}

async function downloadImage(url, filename) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `AtlasAI_${filename.substring(0,20).replace(/\s/g, '_')}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
        window.open(url, '_blank');
    }
}

init();
