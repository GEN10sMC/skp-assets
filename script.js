const API_BASE = 'https://api.skpmc.online:8880';
const WS_BASE = 'wss://api.skpmc.online:8880';

let currentToken = localStorage.getItem('jwt');
let currentName = localStorage.getItem('playerName');
let socket = null;
let selectedFile = null;

// --- Утилиты Безопасности ---
function escapeHTML(str) {
    if (!str) return "";
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}

function formatMCColors(text) {
    if (!text) return "";
    let escaped = escapeHTML(text);
    const colorMap = {
        '0': '#000000', '1': '#0000aa', '2': '#00aa00', '3': '#00aaaa',
        '4': '#aa0000', '5': '#aa00aa', '6': '#ffaa00', '7': '#aaaaaa',
        '8': '#555555', '9': '#5555ff', 'a': '#55ff55', 'b': '#55ffff',
        'c': '#ff5555', 'd': '#ff55ff', 'e': '#ffff55', 'f': '#ffffff'
    };
    // Заменяем § или & на цветные span
    let formatted = escaped.replace(/[&§]([0-9a-fA-F])/g, (match, code) => {
        const color = colorMap[code.toLowerCase()];
        return color ? `</span><span style="color:${color}">` : match;
    });
    return `<span>${formatted}</span>`;
}

// --- УНИВЕРСАЛЬНАЯ СИСТЕМНАЯ МОДАЛКА ---
const SystemModal = {
    el: null,
    title: null,
    message: null,
    inputContainer: null,
    input: null,
    btnOk: null,
    btnCancel: null,
    icon: null,
    resolve: null,

    init() {
        this.el = document.getElementById('system-modal');
        this.title = document.getElementById('system-modal-title');
        this.message = document.getElementById('system-modal-message');
        this.inputContainer = document.getElementById('system-modal-input-container');
        this.input = document.getElementById('system-modal-input');
        this.btnOk = document.getElementById('system-modal-ok');
        this.btnCancel = document.getElementById('system-modal-cancel');
        this.icon = document.getElementById('system-modal-icon');

        this.btnOk.onclick = () => this.handleAction(true);
        this.btnCancel.onclick = () => this.handleAction(false);
        this.input.onkeydown = (e) => { if (e.key === 'Enter') this.handleAction(true); };
    },

    show(options) {
        return new Promise((resolve) => {
            this.resolve = resolve;
            this.title.innerText = options.title || 'Уведомление';
            this.message.innerText = options.message || '';

            if (options.icon && options.icon.length > 2) { // Вероятно это путь к иконке
                 this.icon.src = options.icon;
            } else {
                 this.icon.src = 'icons/notif.png';
            }

            if (options.showInput) {
                this.inputContainer.style.display = 'block';
                this.input.value = options.defaultValue || '';
                this.input.placeholder = options.placeholder || 'Введите значение...';
            } else {
                this.inputContainer.style.display = 'none';
            }

            this.btnCancel.style.display = options.showCancel ? 'block' : 'none';
            this.btnOk.innerText = options.okText || 'ОК';
            this.btnCancel.innerText = options.cancelText || 'Отмена';

            this.el.classList.add('active');
            if (options.showInput) setTimeout(() => this.input.focus(), 100);
        });
    },

    handleAction(isOk) {
        this.el.classList.remove('active');
        if (this.resolve) {
            const isPrompt = this.inputContainer.style.display !== 'none';
            if (isOk) {
                this.resolve(isPrompt ? this.input.value : true);
            } else {
                // confirm() возвращает false при отмене, prompt() - null
                this.resolve(isPrompt ? null : false);
            }
            this.resolve = null;
        }
    }
};

// Заменяем стандартные диалоги
window.alert = (msg) => SystemModal.show({ message: msg, icon: '⚠️', title: 'Внимание' });
window.confirm = (msg) => SystemModal.show({ message: msg, icon: '❓', title: 'Подтверждение', showCancel: true });
window.prompt = (msg, def) => SystemModal.show({ message: msg, icon: '📝', title: 'Ввод данных', showInput: true, defaultValue: def });

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Loaded, initializing...");
    SystemModal.init();
    initAuth();
    initNavigation();
    initFeedActions();
    initFinance();
    initNotifications();
    initReportModal();
    initAdminPanel();
    initChat();
    initHistorySlideshow();
    initSettings();

    if (currentToken) {
        showMainApp();
    } else {
        // Если нет токена, но путь не пустой, сбрасываем на главную
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.history.replaceState({}, '', '/');
        }
    }

    // Слушатель для кнопок "Назад" в браузере
    window.onpopstate = (e) => {
        const screen = window.location.pathname.substring(1) || 'feed';
        if (currentToken) switchScreen(screen, false);
    };
});

// --- Авторизация ---
function initAuth() {
    const btnLogin = document.getElementById('do-login');
    const btnHowTo = document.getElementById('btn-how-to');
    const modalHow = document.getElementById('modal-how');
    const btnCloseModal = document.getElementById('close-modal-how');

    // Кнопка и модалка "О сервере"
    const btnAboutServer = document.getElementById('btn-about-server');
    const modalAbout = document.getElementById('modal-about-server');
    const btnCloseAbout = document.getElementById('close-modal-about-server');
    const videoIframe = document.getElementById('about-video-iframe');

    // ССЫЛКА НА ВИДЕО (Меняйте здесь)
    // Используйте формат /embed/ для YouTube
    const VIDEO_URL = "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1";

    if (btnHowTo && modalHow) btnHowTo.onclick = () => modalHow.classList.add('active');
    if (btnCloseModal && modalHow) btnCloseModal.onclick = () => modalHow.classList.remove('active');

    if (btnAboutServer && modalAbout) {
        btnAboutServer.onclick = () => {
            videoIframe.src = VIDEO_URL;
            modalAbout.classList.add('active');
        };
    }

    if (btnCloseAbout && modalAbout) {
        btnCloseAbout.onclick = () => {
            modalAbout.classList.remove('active');
            videoIframe.src = ""; // Останавливаем видео при закрытии
        };
    }

    if (btnLogin) {
        btnLogin.onclick = async () => {
            const u = document.getElementById('login-user').value;
            const p = document.getElementById('login-pass').value;
            if(!u || !p) return;
            try {
                const res = await fetch(`${API_BASE}/api/auth/login`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ playerName: u, password: p })
                });
                const data = await res.json();
                if (data.token) {
                    currentToken = data.token;
                    currentName = u;
                    localStorage.setItem('jwt', data.token);
                    localStorage.setItem('playerName', u);
                    showMainApp();
                } else { await alert(data.message || 'Ошибка входа'); }
            } catch (e) { await alert('Ошибка подключения'); }
        };
    }
}

async function showMainApp() {
    const loginScreen = document.getElementById('screen-login');
    const mainContent = document.getElementById('main-content');
    if (loginScreen) loginScreen.style.display = 'none';
    document.body.classList.remove('theme-login');
    if (mainContent) mainContent.style.display = 'flex';

    connectWS();

    // Определяем экран из URL
    const path = window.location.pathname.substring(1);
    const validScreens = ['feed', 'chat', 'finance', 'profile', 'map', 'history', 'settings'];
    const initialScreen = validScreens.includes(path) ? path : 'feed';

    switchScreen(initialScreen, false);
    checkAdminStatus();
    loadServerStats();
    setInterval(loadServerStats, 30000);

    // Периодически обновляем ленту (каждые 5 минут)
    setInterval(() => {
        if (window.location.pathname === '/feed') loadFeed();
    }, 300000);
}

window.isAdmin = false;
async function checkAdminStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const user = await res.json();
        window.isAdmin = user.isAdmin || user.rank === 'ADMIN' || ['GuardyYo', 'GEN10s'].includes(currentName);
        if (window.isAdmin) {
            const btn = document.getElementById('btn-admin-reports');
            if (btn) btn.classList.remove('hidden');
        }
    } catch (e) {}
}

// --- Утилиты ---
function getVerifiedBadge(name) {
    if (['GuardyYo', 'GEN10s'].includes(name)) {
        return `<img src="icons/verified.png" class="verified-badge" title="оффициальный профиль" onerror="this.style.display='none'">`;
    }
    return '';
}

// --- Чат и WebSocket ---
function initChat() {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('chat-send');
    if (!input || !btn) return;

    loadChatHistory();

    const sendMessage = () => {
        const text = input.value.trim();
        if (!text) return;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn("Attempted to send message without active WS connection");
            return;
        }
        socket.send(JSON.stringify({ type: 'CHAT', text: text }));
        input.value = '';
    };

    btn.onclick = sendMessage;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') sendMessage();
    };
}

function connectWS() {
    if (socket) {
        socket.onclose = null; // Убираем старый обработчик перед закрытием
        socket.close();
    }
    socket = new WebSocket(`${WS_BASE}/chat?token=${currentToken}`);
    socket.onopen = () => console.log("Connected to Chat WS");
    socket.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'SIGNAL') {
                if (msg.target === currentName && msg.action === 'update_finance') {
                    loadCards(); loadHistory();
                }
                return;
            }
            if (msg.type === 'PONG') return; // Игнорируем ответы на пинг
            renderChatMessage(msg);
        } catch (err) { console.error("WS Message Error:", err); }
    };
    socket.onclose = () => {
        console.log("WS Disconnected, retrying in 5s...");
        setTimeout(connectWS, 5000);
    };

    // Пинг-понг для поддержания соединения (каждые 30 секунд)
    if (window.wsPingInterval) clearInterval(window.wsPingInterval);
    window.wsPingInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'PING' }));
        }
    }, 30000);
}

function renderChatMessage(msg, shouldScroll = true, save = true) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (save) {
        let history = JSON.parse(localStorage.getItem('chat_history') || '[]');
        history.push(msg);
        if (history.length > 15) history = history.slice(-15);
        localStorage.setItem('chat_history', JSON.stringify(history));
    }

    const el = document.createElement('div');
    const isSelf = (msg.author === currentName || msg.sender === currentName);

    if (['JOIN', 'LEAVE', 'DEATH'].includes(msg.type)) {
        el.className = 'msg-system-new anim-scale-in';
        el.innerHTML = `<span>${formatMCColors(msg.text)}</span>`;
    } else {
        el.className = `msg-group ${isSelf ? 'msg-self' : 'msg-other'} anim-slide-up`;
        const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const imgUrlRaw = msg.image_url || msg.imageUrl;
        let imgTag = '';
        if (imgUrlRaw) {
            let src = imgUrlRaw;
            if (!imgUrlRaw.startsWith('http')) {
                src = `${API_BASE}/api/chat/download/${imgUrlRaw}`;
            }
            if (src.includes('/api/chat/download/')) {
                src += (src.includes('?') ? '&' : '?') + `token=${currentToken}`;
            }
            imgTag = `<div class="msg-img"><img src="${src}"></div>`;
        }

        const author = msg.author || msg.sender || 'Система';
        const emoji = msg.author_emoji || (author !== 'Система' ? author[0].toUpperCase() : '🤖');

        el.innerHTML = `
            <div class="msg-avatar-mini">${escapeHTML(emoji)}</div>
            <div class="msg-body-wrapper">
                <div class="msg-author-label">${escapeHTML(author)}${getVerifiedBadge(author)}</div>
                <div class="msg-bubble-new">
                    <div class="msg-text">${formatMCColors(msg.text)}</div>
                    ${imgTag}
                    <div class="msg-time-label">${timeStr}</div>
                </div>
            </div>
        `;
    }
    container.appendChild(el);
    if (shouldScroll) container.scrollTop = container.scrollHeight;
}

function loadChatHistory() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = '';
    const history = JSON.parse(localStorage.getItem('chat_history') || '[]');
    history.forEach(msg => renderChatMessage(msg, false, false));
    container.scrollTop = container.scrollHeight;
}

// --- Навигация ---
function initNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if(btn.dataset.screen) {
            btn.onclick = () => switchScreen(btn.dataset.screen);
        }
    });
    const logout = document.getElementById('btn-logout');
    if (logout) logout.onclick = () => { localStorage.clear(); location.reload(); };
}

function switchScreen(id, updateHistory = true) {
    const layout = document.querySelector('.split-layout');
    if (layout) {
        if (id === 'history') {
            layout.classList.add('hide-promo');
        } else {
            layout.classList.remove('hide-promo');
        }
    }

    document.querySelectorAll('.sub-page').forEach(s => s.style.display = 'none');
    const target = document.getElementById(`screen-${id}`);
    if (target) {
        target.style.display = (id === 'chat') ? 'flex' : 'block';
        const titleEl = document.getElementById('page-title');

        const titles = {
            'feed': 'ЛЕНТА',
            'chat': 'ЧАТЫ',
            'finance': 'ФИНАНСЫ',
            'profile': 'ПРОФИЛЬ',
            'map': 'КАРТА МИРА',
            'history': 'ИСТОРИЯ',
            'settings': 'НАСТРОЙКИ'
        };
        if (titleEl) titleEl.innerText = titles[id] || id.toUpperCase();
        document.title = `SKP Manager — ${titles[id] || id.toUpperCase()}`;

        document.querySelectorAll('.nav-btn').forEach(n => n.classList.toggle('active', n.dataset.screen === id));

        if (id === 'profile' || id === 'settings') loadProfile();
        if (id === 'feed') loadFeed();
        if (id === 'finance') { loadCards(); loadHistory(); checkBankerStatus(); }

        // Обновляем URL
        if (updateHistory) {
            window.history.pushState({screen: id}, '', '/' + id);
        }
    }
}

// Горизонтальный скролл для истории
document.addEventListener('wheel', (e) => {
    const container = document.getElementById('history-scroll-container');
    const screenHistory = document.getElementById('screen-history');
    if (container && screenHistory && screenHistory.style.display !== 'none') {
        if (e.deltaY !== 0) {
            e.preventDefault();
            container.scrollLeft += e.deltaY;
        }
    }
}, { passive: false });

// --- Лента (Feed) ---
function initFeedActions() {
    const imgInput = document.getElementById('post-img-upload');
    const previewArea = document.getElementById('post-preview-area');
    const previewImg = document.getElementById('img-preview-src');
    const removeBtn = document.getElementById('btn-post-img-remove');
    const publishBtn = document.getElementById('btn-post-publish');
    const textInput = document.getElementById('post-text-input');

    if (imgInput) {
        imgInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                selectedFile = file;
                const reader = new FileReader();
                reader.onload = (re) => {
                    previewImg.src = re.target.result;
                    previewArea.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    if (removeBtn) {
        removeBtn.onclick = () => {
            selectedFile = null;
            imgInput.value = '';
            previewArea.style.display = 'none';
        };
    }

    if (publishBtn) {
        publishBtn.onclick = async () => {
            const text = textInput.value.trim();
            if (!text && !selectedFile) return;

            publishBtn.disabled = true;
            publishBtn.innerText = "...";
            try {
                let imageUrls = [];
                if (selectedFile) {
                    const formData = new FormData();
                    formData.append('image', selectedFile);
                    const uploadRes = await fetch(`${API_BASE}/api/chat/upload`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${currentToken}` },
                        body: formData
                    });
                    if (uploadRes.ok) {
                        const uploadData = await uploadRes.json();
                        const url = uploadData.data || uploadData.url;
                        if (url) imageUrls.push(url);
                    }
                }

                const res = await fetch(`${API_BASE}/api/feed/add`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, image_urls: imageUrls })
                });

                if (res.ok) {
                    textInput.value = '';
                    selectedFile = null;
                    if (imgInput) imgInput.value = '';
                    if (previewArea) previewArea.style.display = 'none';
                    loadFeed();
                }
            } catch (e) { await alert('Ошибка публикации'); }
            finally {
                publishBtn.disabled = false;
                publishBtn.innerText = "опубликовать";
            }
        };
    }
}

async function loadFeed() {
    const list = document.getElementById('feed-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/feed`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const responseData = await res.json();
        let posts = Array.isArray(responseData) ? responseData : (responseData.data || []);

        if (!posts.length) {
            list.innerHTML = '<div class="empty-state">Пока здесь пусто...</div>';
            return;
        }

        list.innerHTML = posts.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0)).map((p, index) => {
            const author = p.author || p.authorName || 'Аноним';
            const timestamp = p.timestamp || 0;
            const text = p.text || p.content || '';
            const postId = p.id || index;
            const authorEmoji = p.author_emoji || (author !== 'Аноним' ? author[0].toUpperCase() : '👤');

            const isAuthor = author === currentName;
            const isAdmin = window.isAdmin;

            let imgs = [];
            if (p.image_urls) {
                try {
                    imgs = typeof p.image_urls === 'string' ? JSON.parse(p.image_urls) : p.image_urls;
                } catch(e) { imgs = []; }
            } else if (p.imageUrls) {
                imgs = Array.isArray(p.imageUrls) ? p.imageUrls : [p.imageUrls];
            }

            const imgHtml = Array.isArray(imgs) ? imgs.map(img => {
                if (!img) return '';
                let src = img;
                if (!img.startsWith('http')) src = `${API_BASE}/api/chat/download/${img}`;
                if (src.includes('/api/chat/download/')) src += (src.includes('?') ? '&' : '?') + `token=${currentToken}`;
                return `<div class="post-media-container"><img src="${src}" class="post-img" onerror="this.parentNode.style.display='none'"></div>`;
            }).join('') : '';

            const likesCount = p.likes_count || p.likesCount || 0;
            const likedByMe = p.is_liked || p.isLiked || false;
            const comments = p.comments || [];

            const delay = Math.min(index * 0.1, 1);
            return `
                <div class="post-card anim-slide-up" style="animation-delay: ${delay}s">
                    <div class="post-header">
                        <div class="post-avatar-emoji">${escapeHTML(authorEmoji)}</div>
                        <div class="post-meta">
                            <div class="post-author-name">${escapeHTML(author)}${getVerifiedBadge(author)}</div>
                            <div class="post-timestamp">${timestamp ? new Date(timestamp).toLocaleString() : ''}</div>
                        </div>
                        ${(isAuthor || isAdmin) ? `<button class="post-delete-btn" onclick="deletePost('${postId}')">×</button>` : ''}
                    </div>
                    <div class="post-text-content">${formatMCColors(text)}</div>
                    ${imgHtml}

                    <div class="post-footer-stats">
                        <div class="stats-left">
                            <button class="stat-btn" onclick="toggleLike('${postId}')">
                                <img src="icons/${likedByMe ? 'heart_active.png' : 'heart.png'}" class="stat-icon-img-small">
                                <span class="stat-count">${likesCount}</span>
                            </button>
                            <button class="stat-btn" onclick="toggleComments('${postId}')">
                                <img src="icons/chat.png" class="stat-icon-img-small">
                                <span class="stat-count">${comments.length}</span>
                            </button>
                        </div>
                    </div>

                    <div class="post-comments-section" id="comments-${postId}" style="display:none">
                        <div class="comments-list">
                            ${comments.map(c => {
                                const cEmoji = c.author_emoji || (c.author ? c.author[0].toUpperCase() : '👤');
                                const isCAuthor = c.author === currentName;
                                return `
                                <div class="comment-item">
                                    <div class="comment-avatar-mini">${escapeHTML(cEmoji)}</div>
                                    <div class="comment-content">
                                        <span class="c-author">${escapeHTML(c.author)}${getVerifiedBadge(c.author)}</span>
                                        <span class="c-text">${formatMCColors(c.text)}</span>
                                    </div>
                                    ${(isCAuthor || isAdmin) ? `<button class="comment-delete-btn" onclick="deleteComment('${c.id || ''}', '${postId}')">×</button>` : ''}
                                </div>`;
                            }).join('')}
                        </div>
                        <div class="comment-input-row">
                            <input type="text" placeholder="Написать комментарий..." id="comment-input-${postId}" onkeydown="if(event.key==='Enter') addComment('${postId}')">
                            <button onclick="addComment('${postId}')">➤</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) {
        console.error("Feed error:", e);
        list.innerHTML = '<div class="empty-state">Ошибка загрузки ленты. Проверьте соединение.</div>';
    }
}

// --- Лайки и Комментарии ---
async function toggleLike(postId) {
    try {
        await fetch(`${API_BASE}/api/feed/${postId}/like`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        loadFeed();
    } catch (e) { console.error("Like error:", e); }
}

function toggleComments(postId) {
    const el = document.getElementById(`comments-${postId}`);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const text = input.value.trim();
    if (!text) return;
    try {
        await fetch(`${API_BASE}/api/feed/${postId}/comment`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        input.value = '';
        loadFeed();
    } catch (e) { console.error("Comment error:", e); }
}

window.deletePost = async function(postId) {
    if (!await confirm("Удалить этот пост навсегда?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/feed/${postId}/delete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            loadFeed();
        } else {
            const data = await res.json();
            await alert(data.message || "Ошибка удаления");
        }
    } catch (e) { await alert("Ошибка соединения"); }
};

window.deleteComment = async function(commentId, postId) {
    if (!await confirm("Удалить этот комментарий?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/feed/comments/${commentId}/delete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (res.ok) {
            loadFeed();
        } else {
            const data = await res.json();
            await alert(data.message || "Ошибка удаления");
        }
    } catch (e) { await alert("Ошибка соединения"); }
};

// --- Финансы ---
function initFinance() {
    const btnOpenCreate = document.getElementById('btn-open-create-card');
    const modalCreate = document.getElementById('modal-create-card');
    const btnCloseCreate = document.getElementById('close-modal-card');
    const btnDoCreate = document.getElementById('do-create-card');

    if (btnOpenCreate) btnOpenCreate.onclick = () => modalCreate.classList.add('active');
    if (btnCloseCreate) btnCloseCreate.onclick = () => modalCreate.classList.remove('active');

    // Выбор цвета карты
    document.querySelectorAll('.color-opt').forEach(opt => {
        opt.onclick = () => {
            document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
        };
    });

    if (btnDoCreate) {
        btnDoCreate.onclick = async () => {
            const label = document.getElementById('new-card-label').value;
            const color = document.querySelector('.color-opt.active')?.dataset.color || '#44cf6e';
            if (!label) return;
            try {
                const res = await fetch(`${API_BASE}/api/bank/create-card`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ label, color })
                });
                if (res.ok) {
                    modalCreate.classList.remove('active');
                    loadCards();
                }
            } catch (e) { await alert('Ошибка создания карты'); }
        };
    }

    const btnTransfer = document.getElementById('do-transfer');
    if (btnTransfer) {
        btnTransfer.onclick = async () => {
            const to = document.getElementById('transfer-to').value;
            const amountInput = document.getElementById('transfer-amount');
            const amount = parseInt(amountInput.value);
            if(!to || isNaN(amount)) { await alert('Заполните поля корректно'); return; }

            try {
                const res = await fetch(`${API_BASE}/api/bank/transfer`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ toCard: to, amount: amount })
                });
                const data = await res.json();
                if (res.ok && data.success !== false) {
                    await alert('Перевод выполнен!');
                    document.getElementById('transfer-to').value = '';
                    amountInput.value = '';
                    loadCards(); loadHistory();
                } else { await alert(data.message || 'Ошибка перевода'); }
            } catch (e) { await alert('Ошибка сети'); }
        };
    }

    const btnDeposit = document.getElementById('do-deposit');
    if (btnDeposit) {
        btnDeposit.onclick = async () => {
            const target = document.getElementById('banker-target').value;
            const amountInput = document.getElementById('banker-amount');
            const amount = parseInt(amountInput.value);
            if(!target || isNaN(amount)) return;
            try {
                const res = await fetch(`${API_BASE}/api/bank/deposit`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetCard: target, amount: amount })
                });
                const data = await res.json();
                if (res.ok && data.success !== false) {
                    await alert('Баланс пополнен');
                    document.getElementById('banker-target').value = '';
                    amountInput.value = '';
                    loadCards();
                } else { await alert(data.message || 'Ошибка пополнения'); }
            } catch (e) { await alert('Ошибка сервера'); }
        };
    }

    const btnRefresh = document.getElementById('btn-refresh-history');
    if (btnRefresh) btnRefresh.onclick = () => loadHistory();
}

async function checkBankerStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const user = await res.json();
        const panel = document.getElementById('banker-panel');
        if (panel) {
            const isBanker = user.isBanker || user.is_banker || user.rank === 'BANKER' || user.rank === 'ADMIN';
            panel.style.display = isBanker ? 'block' : 'none';
        }
    } catch (e) {}
}

async function loadCards() {
    const list = document.getElementById('cards-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/players/stats/${currentName}`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const p = await res.json();
        if (p.cards) {
            list.innerHTML = p.cards.map((c, index) => {
                const delay = Math.min(index * 0.1, 0.5);
                return `
                <div class="card-item anim-scale-in" style="background: ${(c.color || '#44cf6e')}B3; color: #fff; animation-delay: ${delay}s">
                    <div class="card-chip"></div>
                    <div class="card-holder">${c.label || 'ЛИЧНАЯ КАРТА'}</div>
                    <div class="card-number">${c.number}</div>
                    <div class="card-balance">${c.balance.toLocaleString()} <span>ST</span></div>
                </div>`;
            }).join('');
        }
    } catch (e) {}
}

async function loadHistory() {
    const list = document.getElementById('history-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/bank/history`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const responseData = await res.json();
        const history = Array.isArray(responseData) ? responseData : (responseData.data || []);

        list.innerHTML = history.length ? history.map(h => {
            const isOut = h.from_owner === currentName;
            const otherParty = isOut ? h.to_owner : h.from_owner;
            return `
                <div class="history-item" style="display: flex; justify-content: space-between; padding: 12px; border-bottom: 1px solid #222;">
                    <div style="display:flex; align-items:center;">
                        <img src="https://mc-heads.net/avatar/${otherParty}/32" style="width:32px; height:32px; border-radius:4px; margin-right:12px;">
                        <div>
                            <div style="font-size:14px; color:#eee;">${otherParty}</div>
                            <div style="font-size:11px; color:#666;">${new Date(h.timestamp).toLocaleString()}</div>
                        </div>
                    </div>
                    <div style="color: ${isOut ? '#ff4d4d' : '#44cf6e'}; font-weight:bold; font-size:15px;">
                        ${isOut ? '-' : '+'}${h.amount.toLocaleString()} ST
                    </div>
                </div>`;
        }).join('') : '<div class="empty-state">История транзакций пуста</div>';
    } catch (e) {}
}

// --- Профиль ---
async function loadProfile() {
    try {
        const res = await fetch(`${API_BASE}/api/players/stats/${currentName}`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const p = await res.json();

        // Обновление вкладки "ПРОФИЛЬ"
        const nameEl = document.getElementById('p-name');
        const userEl = document.getElementById('p-username');
        if (nameEl) nameEl.innerHTML = (p.name || currentName) + getVerifiedBadge(p.name || currentName);
        const atName = p.username || p.at_username || (p.name || currentName).toLowerCase();
        if (userEl) userEl.innerText = `@${atName}`;

        const deathsEl = document.getElementById('p-deaths');
        const killsEl = document.getElementById('p-kills');
        const playEl = document.getElementById('p-playtime');
        const kdEl = document.getElementById('p-kd');

        const kills = p.kills || 0;
        const deaths = p.deaths || 0;

        if (deathsEl) deathsEl.innerText = deaths;
        if (killsEl) killsEl.innerText = kills;
        if (playEl) playEl.innerText = Math.floor(p.playtimeHours || 0);
        if (kdEl) kdEl.innerText = deaths === 0 ? kills.toFixed(1) : (kills / deaths).toFixed(1);

        const score = p.idiotScore || 0;
        const pctEl = document.getElementById('p-idiot-percent');
        const fillEl = document.getElementById('p-idiot-fill');
        if(pctEl) pctEl.innerText = `${score}%`;
        if(fillEl) fillEl.style.width = `${score}%`;

        const lavaEl = document.getElementById('p-lava');
        const voidEl = document.getElementById('p-void');
        const tntEl = document.getElementById('p-tnt');
        if (lavaEl) lavaEl.innerText = p.deathsByLava || 0;
        if (voidEl) voidEl.innerText = p.deathsByVoid || 0;
        if (tntEl) tntEl.innerText = p.selfTntDeaths || 0;

        let rank = p.rank_display || p.rank;
        if (!rank) {
            if (p.isAdmin) rank = 'Админ';
            else if (p.isBanker) rank = 'Банкир';
            else rank = 'Нормис';
        }

        const rankEl = document.getElementById('p-rank');
        if (rankEl) rankEl.innerText = rank;

        const pAvatarContent = document.getElementById('profile-avatar-content');
        if (pAvatarContent) {
            const emoji = p.avatarEmoji || p.avatar_emoji || '';
            pAvatarContent.innerText = emoji ? emoji : (p.name ? p.name[0].toUpperCase() : '?');
        }

        // Обновление вкладки "НАСТРОЙКИ"
        const sName = document.getElementById('settings-p-name');
        const sUser = document.getElementById('settings-p-username');
        const sRank = document.getElementById('settings-p-rank');
        const sLetter = document.getElementById('settings-avatar-letter');
        const sEmoji = document.getElementById('p-emoji-val');
        const sClan = document.getElementById('p-clantag-val');
        const sAt = document.getElementById('p-at-username');

        if (sName) sName.innerHTML = (p.name || currentName) + getVerifiedBadge(p.name || currentName);
        if (sUser) sUser.innerText = `@${atName}`;
        if (sRank) sRank.innerText = rank;
        if (sLetter) {
            const emoji = p.avatarEmoji || p.avatar_emoji || '';
            sLetter.innerText = emoji ? emoji : (p.name ? p.name[0].toUpperCase() : '?');
        }
        if (sEmoji) sEmoji.innerText = p.avatarEmoji || p.avatar_emoji || '❌';
        if (sClan) {
            const tag = p.clanTag || p.clan_tag;
            sClan.innerText = tag ? `[${tag}]` : 'Не установлен';
        }
        if (sAt) sAt.innerText = `@${atName}`;

    } catch (e) {
        console.error("Load profile error:", e);
    }
}

// --- Настройки ---
function initSettings() {
    const btnClantag = document.getElementById('btn-set-clantag');
    const btnAvatar = document.getElementById('btn-set-avatar');
    const btnUsername = document.getElementById('btn-set-username');
    const btnAbout = document.getElementById('btn-about-app');

    // Клан-тег модалка
    const modalClantag = document.getElementById('modal-clantag');
    const inputClantag = document.getElementById('input-clantag-text');
    const previewClantag = document.getElementById('clantag-preview-render');
    const colorCircles = document.querySelectorAll('.color-circle');
    const btnSaveClantag = document.getElementById('btn-save-clantag');
    const btnClearClantag = document.getElementById('btn-clear-clantag');
    const btnCloseClantag = document.getElementById('close-modal-clantag');

    // Аватар модалка
    const modalAvatar = document.getElementById('modal-avatar');
    const btnCloseAvatar = document.getElementById('close-modal-avatar');
    const emojiOpts = document.querySelectorAll('.emoji-opt');

    let selectedColor = "#000000";

    if (btnClantag) {
        btnClantag.onclick = () => {
            modalClantag.classList.add('active');
            inputClantag.focus();
        };
    }

    if (btnCloseClantag) btnCloseClantag.onclick = () => modalClantag.classList.remove('active');

    if (inputClantag) {
        inputClantag.oninput = () => {
            const val = inputClantag.value.trim().toUpperCase();
            previewClantag.innerText = val ? `[${val}]` : '[ПРЕВЬЮ]';
            previewClantag.style.color = selectedColor;

            if (val.length > 0) {
                btnSaveClantag.disabled = false;
                btnSaveClantag.classList.add('ready');
            } else {
                btnSaveClantag.disabled = true;
                btnSaveClantag.classList.remove('ready');
            }
        };
    }

    colorCircles.forEach(circle => {
        circle.onclick = () => {
            colorCircles.forEach(c => c.classList.remove('active'));
            circle.classList.add('active');
            selectedColor = circle.dataset.color;
            previewClantag.style.color = selectedColor;
        };
    });

    if (btnSaveClantag) {
        btnSaveClantag.onclick = async () => {
            const tag = inputClantag.value.trim();
            if (!tag) return;
            modalClantag.classList.remove('active');
            await updateProfileField('clan_tag', tag, selectedColor);
        };
    }

    if (btnClearClantag) {
        btnClearClantag.onclick = async () => {
            if (await confirm("Удалить клан-тег?")) {
                modalClantag.classList.remove('active');
                await updateProfileField('clan_tag', null);
                inputClantag.value = '';
                previewClantag.innerText = '[ПРЕВЬЮ]';
            }
        };
    }

    if (btnAvatar) {
        btnAvatar.onclick = () => modalAvatar.classList.add('active');
    }

    if (btnCloseAvatar) btnCloseAvatar.onclick = () => modalAvatar.classList.remove('active');

    emojiOpts.forEach(opt => {
        opt.onclick = async () => {
            const emoji = opt.innerText;
            modalAvatar.classList.remove('active');
            await updateProfileField('avatar_emoji', emoji);
        };
    });

    if (btnUsername) {
        btnUsername.onclick = async () => {
            const atName = await prompt("Введите ваш новый уникальный юзернейм (@):");
            if (!atName) return;
            await updateProfileField('at_username', atName.replace('@', ''));
        };
    }

    if (btnAbout) {
        btnAbout.onclick = async () => {
            await alert("Внимание: Данный сайт, а также игровой сервер SKP являются независимыми фанатскими проектами.\n\n" +
                        "• Настоящий ресурс НЕ ЯВЛЯЕТСЯ официальным сайтом Minecraft.\n" +
                        "• Мы НЕ СВЯЗАНЫ с компанией Mojang Studios или Microsoft.\n" +
                        "• Все торговые марки, персонажи, текстуры и звуки, используемые в игре, принадлежат их правообладателям.\n\n" +
                        "По всем вопросам работы сервера, доната или сотрудничества обращаться строго через контакты, указанные в подвале сайта или в нашем официальном Discord/Telegram.");
        };
    }
}

async function updateProfileField(field, value, extra = null) {
    try {
        let endpoint = '';
        let body = {};

        if (field === 'clan_tag') {
            endpoint = '/api/players/update-tag';
            body = { clanTag: value, clanTagColor: extra || '#ffffff' };
        } else if (field === 'avatar_emoji') {
            endpoint = '/api/players/update-avatar';
            body = { avatarEmoji: value };
        } else if (field === 'at_username') {
            endpoint = '/api/players/set-username';
            body = { username: value };
        } else {
            return;
        }

        const res = await fetch(`${API_BASE}${endpoint}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (res.ok) {
            loadProfile();
        } else {
            const data = await res.json();
            await alert(data.message || 'Ошибка обновления');
        }
    } catch (e) {
        await alert('Ошибка соединения с сервером');
    }
}

// --- Судебная система ---
function initReportModal() {
    const btnOpen = document.getElementById('btn-open-report');
    const modal = document.getElementById('modal-report');
    if (btnOpen && modal) btnOpen.onclick = () => { modal.classList.add('active'); loadMyReports(); };

    const btnClose = document.getElementById('close-modal-report');
    if (btnClose && modal) btnClose.onclick = () => modal.classList.remove('active');

    const descInput = document.getElementById('report-desc');
    const charCounter = document.getElementById('report-char-count');
    if (descInput && charCounter) {
        descInput.oninput = () => {
            charCounter.innerText = descInput.value.length;
        };
    }

    const btnSubmit = document.getElementById('btn-submit-report');
    if (btnSubmit) {
        btnSubmit.onclick = async () => {
            const target = document.getElementById('report-target').value;
            const reason = document.getElementById('report-reason').value;
            const desc = document.getElementById('report-desc').value;
            if (!target || !desc) { await alert('Заполните все поля доноса!'); return; }
            const res = await fetch(`${API_BASE}/api/reports/create`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetName: target, reason, description: desc })
            });
            if (res.ok) {
                await alert('Донос успешно принят!');
                document.getElementById('report-target').value = '';
                document.getElementById('report-desc').value = '';
                loadMyReports();
            }
        };
    }
}

async function loadMyReports() {
    const list = document.getElementById('my-reports-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/reports/my`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const reports = await res.json();
        list.innerHTML = reports.map(r => `
            <div class="report-item-mini">
                <button class="btn-delete-report" onclick="deleteReport('${r.id}')">×</button>
                <div style="display:flex; justify-content:space-between; margin-bottom:4px; padding-right: 20px;">
                    <span style="color:#44cf6e; font-weight:bold; font-size:12px;">${r.reason}</span>
                    <span style="font-size:10px; opacity:0.6; text-transform:uppercase;">${r.status || 'PENDING'}</span>
                </div>
                <div style="font-size:11px; opacity:0.8;">На: ${r.targetName || r.target_player || 'Неизвестно'}</div>
                ${r.adminResponse ? `
                    <div style="margin-top:8px; padding:8px; background:rgba(68, 207, 110, 0.05); border-left:2px solid #44cf6e; font-size:12px; border-radius:4px;">
                        <b style="color:#44cf6e; font-size:10px; display:block; margin-bottom:2px;">ВЕРДИКТ:</b>
                        ${r.adminResponse}
                    </div>` : ''}
            </div>`).join('');
    } catch (e) {}
}

window.deleteReport = async function(id) {
    if(!await confirm("Удалить этот иск из истории?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/reports/delete`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ reportId: id })
        });
        if (res.ok) loadMyReports();
    } catch (e) { await alert('Ошибка удаления'); }
};

// --- Админка ---
async function checkAdminStatus() {
    try {
        const res = await fetch(`${API_BASE}/api/me`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const user = await res.json();
        const isAdmin = user.isAdmin || user.rank === 'ADMIN';
        if (isAdmin) {
            const btn = document.getElementById('btn-admin-reports');
            if (btn) btn.classList.remove('hidden');
        }
    } catch (e) {}
}

function initAdminPanel() {
    const btnOpen = document.getElementById('btn-admin-reports');
    const modal = document.getElementById('modal-admin-reports');
    if (btnOpen && modal) btnOpen.onclick = () => { modal.classList.add('active'); switchAdminTab('tab-reports'); };

    const btnClose = document.getElementById('close-modal-admin-reports');
    if (btnClose && modal) btnClose.onclick = () => modal.classList.remove('active');

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.onclick = () => switchAdminTab(btn.dataset.tab);
    });

    const searchInput = document.getElementById('admin-player-search');
    if (searchInput) {
        searchInput.oninput = () => {
            const val = searchInput.value.toLowerCase();
            document.querySelectorAll('#admin-players-list .admin-item-card').forEach(card => {
                const name = card.querySelector('.admin-item-name').innerText.toLowerCase();
                card.style.display = name.includes(val) ? 'flex' : 'none';
            });
        };
    }
}

function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));

    const target = document.getElementById(tabId);
    const btn = document.querySelector(`[data-tab="${tabId}"]`);
    if (target) target.classList.add('active');
    if (btn) btn.classList.add('active');

    if (tabId === 'tab-reports') loadAdminReports();
    if (tabId === 'tab-players') loadAdminPlayers();
    if (tabId === 'tab-bans') loadAdminBans();
}

async function loadAdminReports() {
    const list = document.getElementById('admin-reports-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/reports/all`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const reports = await res.json();
        list.innerHTML = reports.map(r => `
            <div class="admin-item-card">
                <div class="admin-item-text">
                    <div class="admin-item-name">${r.reporterName || r.sender || 'Аноним'} -> ${r.targetName || r.target_player || '???'}</div>
                    <div class="admin-item-sub"><b>${r.reason}:</b> ${r.description}</div>
                </div>
                <button class="btn-admin-small btn-resolve" onclick="openReplyModal('${r.id}', '${r.reporterName || r.sender}')">РЕШИТЬ</button>
            </div>`).join('');
    } catch (e) {}
}

async function loadAdminPlayers() {
    const list = document.getElementById('admin-players-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/players`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const players = await res.json();
        list.innerHTML = players.map(p => `
            <div class="admin-item-card">
                <div class="admin-item-info">
                    <img src="https://mc-heads.net/avatar/${p.name}/32" class="admin-avatar">
                    <div class="admin-item-name">${p.name}</div>
                </div>
                <div class="admin-actions">
                    <button class="btn-admin-small btn-kick" onclick="adminAction('kick', '${p.name}')">КИК</button>
                    <button class="btn-admin-small btn-ban" onclick="adminAction('ban', '${p.name}')">БАН</button>
                </div>
            </div>`).join('');
    } catch (e) {}
}

async function loadAdminBans() {
    const list = document.getElementById('admin-bans-list');
    if (!list) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/banned-players`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const bans = await res.json();
        list.innerHTML = bans.length ? bans.map(b => `
            <div class="admin-item-card">
                <div class="admin-item-info">
                    <img src="https://mc-heads.net/avatar/${b.name}/32" class="admin-avatar">
                    <div class="admin-item-name">${b.name}</div>
                </div>
                <button class="btn-admin-small btn-unban" onclick="adminAction('unban', '${b.name}')">РАЗБАН</button>
            </div>`).join('') : '<div class="empty-state">Список забаненных пуст</div>';
    } catch (e) {}
}

window.adminAction = async function(action, target) {
    const reason = action !== 'unban' ? await prompt(`Причина для ${action} игрока ${target}:`) : "";
    if (reason === null) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/moderate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, targetName: target, reason })
        });
        if (res.ok) {
            await alert('Действие успешно выполнено');
            loadAdminPlayers(); loadAdminBans();
        }
    } catch (e) { await alert('Ошибка при выполнении'); }
}

window.openReplyModal = function(id, sender) {
    window.currentActiveReportId = id;
    const info = document.getElementById('reply-report-info');
    const modal = document.getElementById('modal-report-reply');
    if (info) info.innerText = `Вердикт по иску от ${sender}`;
    if (modal) modal.classList.add('active');
}

const btnCloseReply = document.getElementById('close-modal-reply');
if (btnCloseReply) btnCloseReply.onclick = () => document.getElementById('modal-report-reply').classList.remove('active');

const btnSubmitReply = document.getElementById('btn-submit-reply');
if (btnSubmitReply) {
    btnSubmitReply.onclick = async () => {
        const response = document.getElementById('admin-reply-text').value;
        const status = document.getElementById('admin-reply-status').value;
        try {
            const res = await fetch(`${API_BASE}/api/admin/reports/resolve`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reportId: window.currentActiveReportId, response, status })
            });
            if (res.ok) {
                const modal = document.getElementById('modal-report-reply');
                if (modal) modal.classList.remove('active');
                document.getElementById('admin-reply-text').value = '';
                loadAdminReports();
            }
        } catch (e) { await alert('Ошибка вердикта'); }
    };
}

// --- Статистика ---
async function loadServerStats() {
    try {
        const res = await fetch(`${API_BASE}/api/server/stats`, { headers: { 'Authorization': `Bearer ${currentToken}` } });
        const s = await res.json();
        const onlineEl = document.getElementById('online-players');
        const tpsEl = document.getElementById('server-tps');
        if (onlineEl) onlineEl.innerText = s.onlineCount ?? 0;
        if (tpsEl) tpsEl.innerText = (s.tps ?? 20.0).toFixed(1);
    } catch (e) {}
}

function initNotifications() {
    const btn = document.getElementById('btn-notif');
    const panel = document.getElementById('notif-dropdown');
    if (btn && panel) {
        btn.onclick = (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        };
        document.addEventListener('click', () => { if(panel) panel.style.display = 'none'; });
        panel.onclick = (e) => e.stopPropagation();
    }
}

function initHistorySlideshow() {
    const card = document.getElementById('history-card-4');
    if (!card) return;

    let interval = null;
    const images = card.querySelectorAll('.history-card-img');
    let currentIndex = 0;

    card.addEventListener('mouseenter', () => {
        // Сразу сбрасываем индекс при повторном наведении, если нужно
        interval = setInterval(() => {
            images[currentIndex].classList.remove('active');
            currentIndex = (currentIndex + 1) % images.length;
            images[currentIndex].classList.add('active');
        }, 3000);
    });

    card.addEventListener('mouseleave', () => {
        clearInterval(interval);
    });
}
