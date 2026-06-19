/* ============================================================
   JARVIS Dashboard — Main Application Logic
   Audio + Text chat with streaming, conversation persistence
   ============================================================ */

const API_BASE = window.location.origin;

// --- State ---
const state = {
    currentConversationId: null,
    conversations: [],
    isStreaming: false,
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    recordingTimer: null,
    recordingSeconds: 0,
    abortController: null,
    isVoiceEnabled: true,
    audioPlayer: null,
};

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebarToggle'),
    sidebarCloseBtn: $('#sidebarCloseBtn'),
    newChatBtn: $('#newChatBtn'),
    searchInput: $('#searchInput'),
    conversationList: $('#conversationList'),
    messagesWrapper: $('#messagesWrapper'),
    messagesContainer: $('#messagesContainer'),
    welcomeScreen: $('#welcomeScreen'),
    messageInput: $('#messageInput'),
    sendBtn: $('#sendBtn'),
    stopBtn: $('#stopBtn'),
    micBtn: $('#micBtn'),
    webcamBtn: $('#webcamBtn'),
    webcamVideo: $('#webcamVideo'),
    webcamCanvas: $('#webcamCanvas'),
    attachBtn: $('#attachBtn'),
    fileInput: $('#fileInput'),
    attachmentPreviewContainer: $('#attachmentPreviewContainer'),
    imagePreview: $('#imagePreview'),
    removeAttachmentBtn: $('#removeAttachmentBtn'),
    audioIndicator: $('#audioIndicator'),
    audioTimer: $('#audioTimer'),
    audioCancelBtn: $('#audioCancelBtn'),
    suggestionChips: $('#suggestionChips'),
    voiceToggle: $('#voiceToggle'),
};

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadConversations();
});

function initEventListeners() {
    // Sidebar
    els.sidebarToggle.addEventListener('click', toggleSidebar);
    els.sidebarCloseBtn.addEventListener('click', closeSidebar);
    els.newChatBtn.addEventListener('click', createNewChat);
    els.searchInput.addEventListener('input', filterConversations);

    // Voice Toggle
    if (els.voiceToggle) {
        els.voiceToggle.addEventListener('click', () => {
            state.isVoiceEnabled = !state.isVoiceEnabled;
            els.voiceToggle.classList.toggle('active', state.isVoiceEnabled);
            if (!state.isVoiceEnabled) stopSpeaking();
        });
    }

    // Input
    els.messageInput.addEventListener('input', handleInputChange);
    els.messageInput.addEventListener('keydown', handleInputKeydown);
    els.sendBtn.addEventListener('click', () => sendMessage());
    els.stopBtn.addEventListener('click', stopStreaming);

    // Attachments
    if (els.webcamBtn) {
        els.webcamBtn.addEventListener('click', captureWebcamSnapshot);
    }
    if (els.attachBtn && els.fileInput) {
        els.attachBtn.addEventListener('click', (e) => {
            e.preventDefault();
            els.fileInput.click();
        });
        els.fileInput.addEventListener('change', handleFileSelection);
    }
    if (els.removeAttachmentBtn) {
        els.removeAttachmentBtn.addEventListener('click', clearAttachment);
    }

    // Audio
    els.micBtn.addEventListener('click', toggleRecording);
    els.audioCancelBtn.addEventListener('click', cancelRecording);

    // Phase 3: Walkie-Talkie Push-to-Talk
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement !== els.messageInput && !state.isRecording) {
            e.preventDefault();
            toggleRecording();
        }
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space' && document.activeElement !== els.messageInput && state.isRecording) {
            toggleRecording();
        }
    });

    // Phase 3: Wake Word
    initWakeWord();

    // Suggestion chips
    $$('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.prompt;
            if (prompt) {
                els.messageInput.value = prompt;
                handleInputChange();
                sendMessage();
            }
        });
    });

    // Mobile overlay
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.id = 'sidebarOverlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
}

// ============================================================
// CONVERSATIONS
// ============================================================

async function loadConversations() {
    try {
        const res = await fetch(`${API_BASE}/api/conversations`);
        const data = await res.json();
        state.conversations = data.conversations || [];
        renderConversationList();
    } catch (err) {
        console.error('Failed to load conversations:', err);
    }
}

async function createNewChat() {
    try {
        const res = await fetch(`${API_BASE}/api/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const conv = await res.json();
        state.currentConversationId = conv.id;
        await loadConversations();
        showWelcomeScreen();
        els.messageInput.focus();
        closeSidebar();
    } catch (err) {
        console.error('Failed to create conversation:', err);
    }
}

async function switchConversation(convId) {
    if (state.isStreaming) return;
    state.currentConversationId = convId;
    renderConversationList();
    closeSidebar();

    try {
        const res = await fetch(`${API_BASE}/api/conversations/${convId}`);
        const conv = await res.json();
        renderMessages(conv.messages || []);
    } catch (err) {
        console.error('Failed to load conversation:', err);
    }
}

async function deleteConversation(convId, event) {
    event.stopPropagation();
    try {
        await fetch(`${API_BASE}/api/conversations/${convId}`, { method: 'DELETE' });
        if (state.currentConversationId === convId) {
            state.currentConversationId = null;
            showWelcomeScreen();
        }
        await loadConversations();
    } catch (err) {
        console.error('Failed to delete conversation:', err);
    }
}

function filterConversations() {
    const query = els.searchInput.value.toLowerCase().trim();
    const items = els.conversationList.querySelectorAll('.conv-item');
    items.forEach(item => {
        const title = item.querySelector('.conv-item-title').textContent.toLowerCase();
        item.style.display = title.includes(query) ? '' : 'none';
    });
}

// ============================================================
// RENDERING
// ============================================================

function renderConversationList() {
    const container = els.conversationList;
    container.innerHTML = '';

    if (state.conversations.length === 0) {
        container.innerHTML = `
            <div style="padding: 24px 16px; text-align: center; color: var(--text-tertiary); font-size: 0.8125rem;">
                No conversations yet
            </div>`;
        return;
    }

    state.conversations.forEach(conv => {
        const item = document.createElement('div');
        item.className = `conv-item${conv.id === state.currentConversationId ? ' active' : ''}`;
        item.onclick = () => switchConversation(conv.id);
        item.innerHTML = `
            <svg class="conv-item-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="conv-item-title">${escapeHtml(conv.title)}</span>
            <button class="conv-item-delete" title="Delete conversation">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>`;
        item.querySelector('.conv-item-delete').onclick = (e) => deleteConversation(conv.id, e);
        container.appendChild(item);
    });
}

function renderMessages(messages) {
    // Remove welcome screen, keep container
    els.messagesContainer.innerHTML = '';

    if (messages.length === 0) {
        showWelcomeScreen();
        return;
    }

    hideWelcomeScreen();
    messages.forEach(msg => {
        appendMessageBubble(msg.role, msg.content);
    });
    scrollToBottom();
}

function appendMessageBubble(role, content) {
    hideWelcomeScreen();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;

    const avatarLabel = role === 'user' ? 'U' : '✦';
    const roleLabel = role === 'user' ? 'You' : 'JARVIS';

    msgDiv.innerHTML = `
        <div class="message-avatar">${avatarLabel}</div>
        <div class="message-content">
            <div class="message-role">${roleLabel}</div>
            <div class="message-text">${role === 'assistant' ? renderMarkdown(content) : escapeHtml(content)}</div>
        </div>`;

    els.messagesContainer.appendChild(msgDiv);
    scrollToBottom();
    return msgDiv;
}

function showWelcomeScreen() {
    els.messagesContainer.innerHTML = '';
    const welcome = document.createElement('div');
    welcome.className = 'welcome-screen';
    welcome.id = 'welcomeScreen';
    welcome.innerHTML = `
        <div class="welcome-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="url(#starGrad2)" stroke="none"/>
                <defs><linearGradient id="starGrad2" x1="2" y1="2" x2="22" y2="22">
                    <stop offset="0%" stop-color="#8ab4f8"/><stop offset="100%" stop-color="#c58af9"/>
                </linearGradient></defs>
            </svg>
        </div>
        <h2 class="welcome-title">Hello, how can I help you today?</h2>
        <p class="welcome-subtitle">Your AI-powered chatbot assistant</p>
        <div class="suggestion-chips">
            <button class="chip" data-prompt="Explain how your local RAG capabilities and ChromaDB memory system works">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Local RAG Capabilities</span>
            </button>
            <button class="chip" data-prompt="Write a Python function to sort a list of dictionaries by a specific key">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                <span>Write some code</span>
            </button>
            <button class="chip" data-prompt="What are you capable of? Tell me about your tech stack and features.">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                <span>Your capabilities</span>
            </button>
            <button class="chip" data-prompt="Help me brainstorm ideas for a weekend project">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                <span>Brainstorm ideas</span>
            </button>
        </div>`;

    els.messagesContainer.appendChild(welcome);

    // Re-bind chip listeners
    welcome.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.prompt;
            if (prompt) {
                els.messageInput.value = prompt;
                handleInputChange();
                sendMessage();
            }
        });
    });
}

function hideWelcomeScreen() {
    const ws = els.messagesContainer.querySelector('.welcome-screen');
    if (ws) ws.remove();
}

function showTypingIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'message assistant';
    indicator.id = 'typingIndicator';
    indicator.innerHTML = `
        <div class="message-avatar">✦</div>
        <div class="message-content">
            <div class="message-role">JARVIS</div>
            <div class="typing-indicator">
                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
            </div>
        </div>`;
    els.messagesContainer.appendChild(indicator);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        els.messagesWrapper.scrollTop = els.messagesWrapper.scrollHeight;
    });
}

// ============================================================
// SENDING MESSAGES
// ============================================================

async function sendMessage(text = null) {
    if (state.isStreaming) return;
    
    stopSpeaking(); // Stop any ongoing speech when sending new message

    const messageText = text || els.messageInput.value.trim();
    if (!messageText && !state.audioBlob) return;

    // Ensure we have a conversation
    if (!state.currentConversationId) {
        try {
            const res = await fetch(`${API_BASE}/api/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const conv = await res.json();
            state.currentConversationId = conv.id;
        } catch (err) {
            console.error('Failed to create conversation:', err);
            return;
        }
    }

    // Build request body
    const body = { conversation_id: state.currentConversationId, message: messageText };

    // Handle image attachment
    if (state.attachedImage) {
        body.image_base64 = state.attachedImage;
        body.image_mime_type = state.attachedImageMime;
    }

    // Handle audio
    if (state.audioBlob) {
        const reader = new FileReader();
        const audioBase64 = await new Promise((resolve) => {
            reader.onloadend = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.readAsDataURL(state.audioBlob);
        });
        body.audio_base64 = audioBase64;
        body.audio_mime_type = state.audioBlob.type || 'audio/webm';
        state.audioBlob = null;
    }

    // Show user message
    let displayText = messageText;
    if (!displayText) {
        if (body.audio_base64) displayText = '🎤 Voice message';
        else if (body.image_base64) displayText = '🖼️ Image attachment';
    }
    appendMessageBubble('user', displayText);

    // Clear input
    els.messageInput.value = '';
    clearAttachment();
    handleInputChange();

    // Start streaming
    state.isStreaming = true;
    els.sendBtn.classList.add('hidden');
    els.stopBtn.classList.remove('hidden');
    els.micBtn.disabled = true;

    showTypingIndicator();

    state.abortController = new AbortController();

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: state.abortController.signal,
        });

        removeTypingIndicator();

        // Create assistant message bubble for streaming
        const assistantMsg = appendMessageBubble('assistant', '');
        const textEl = assistantMsg.querySelector('.message-text');
        let fullText = '';

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.substring(6).trim();
                if (!jsonStr) continue;

                try {
                    const event = JSON.parse(jsonStr);
                    if (event.text) {
                        fullText += event.text;
                        textEl.innerHTML = renderMarkdown(fullText);
                        scrollToBottom();
                    } else if (event.error) {
                        textEl.innerHTML = `<span class="error-text">${escapeHtml(event.error)}</span>`;
                    } else if (event.done) {
                        // Streaming complete
                        if (state.isVoiceEnabled && fullText) {
                            speak(fullText);
                        }
                    }
                } catch (e) {
                    // Skip malformed JSON
                }
            }
        }
    } catch (err) {
        removeTypingIndicator();
        if (err.name !== 'AbortError') {
            appendMessageBubble('assistant', '⚠️ Failed to connect to the server. Make sure the chat server is running.');
        }
    } finally {
        state.isStreaming = false;
        state.abortController = null;
        els.sendBtn.classList.remove('hidden');
        els.stopBtn.classList.add('hidden');
        els.micBtn.disabled = false;
        handleInputChange();
        loadConversations(); // Refresh sidebar
    }
}

function stopStreaming() {
    if (state.abortController) {
        state.abortController.abort();
    }
    stopSpeaking();
}

// ============================================================
// TEXT-TO-SPEECH (TTS)
// ============================================================

async function speak(text) {
    if (!state.isVoiceEnabled) return;
    
    stopSpeaking();

    // Strip markdown formatting for cleaner speech
    let cleanText = text
        .replace(/[*_~`]/g, '') // remove bold, italic, strikethrough, code
        .replace(/###/g, '')    // remove headers
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // replace links with just text
        .replace(/```[\s\S]*?```/g, 'Code block omitted.') // don't read long code blocks
        .replace(/#/g, '') // remove remaining hash marks
        .trim();

    if (!cleanText) return;

    try {
        const res = await fetch(`${API_BASE}/api/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText })
        });
        
        if (!res.ok) throw new Error('TTS API failed');
        
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        
        state.audioPlayer = new Audio(url);
        state.audioPlayer.play();
    } catch (e) {
        console.error("Audio generation failed:", e);
    }
}

function stopSpeaking() {
    if (state.audioPlayer) {
        state.audioPlayer.pause();
        state.audioPlayer.src = '';
        state.audioPlayer = null;
    }
}

// ============================================================
// AUDIO RECORDING
// ============================================================

async function toggleRecording() {
    if (state.isRecording) {
        stopRecording();
    } else {
        await startRecording();
    }
}

async function startRecording() {
    stopSpeaking();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Determine supported mime type
        let mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = '';
                }
            }
        }

        const options = mimeType ? { mimeType } : {};
        state.mediaRecorder = new MediaRecorder(stream, options);
        state.audioChunks = [];

        state.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) state.audioChunks.push(e.data);
        };

        state.mediaRecorder.onstop = () => {
            const blob = new Blob(state.audioChunks, { type: state.mediaRecorder.mimeType || 'audio/webm' });
            state.audioBlob = blob;
            stream.getTracks().forEach(t => t.stop());

            // Auto-send the voice message
            sendMessage();
        };

        state.mediaRecorder.start(100);
        state.isRecording = true;

        // --- Voice Activity Detection (3-second silence cutoff) ---
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        let silenceTimeout = null;
        const resetSilence = () => {
            clearTimeout(silenceTimeout);
            silenceTimeout = setTimeout(() => {
                if (state.isRecording) {
                    console.log("3 seconds of silence detected, auto-stopping recording...");
                    stopRecording();
                }
            }, 3000);
        };

        const checkAudioLevel = () => {
            if (!state.isRecording) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
            let avg = sum / dataArray.length;
            
            if (avg > 10) { // Volume threshold
                resetSilence();
            }
            requestAnimationFrame(checkAudioLevel);
        };
        resetSilence();
        checkAudioLevel();
        // -----------------------------------------------------------

        // UI updates
        els.micBtn.classList.add('recording');
        els.audioIndicator.classList.add('active');
        state.recordingSeconds = 0;
        updateRecordingTimer();
        state.recordingTimer = setInterval(updateRecordingTimer, 1000);

    } catch (err) {
        console.error('Microphone access denied:', err);
        alert('Microphone access is required for voice messages. Please allow microphone access in your browser settings.');
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
    }
    state.isRecording = false;
    els.micBtn.classList.remove('recording');
    els.audioIndicator.classList.remove('active');
    clearInterval(state.recordingTimer);
}

function cancelRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.onstop = null; // Prevent auto-send
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    state.isRecording = false;
    state.audioChunks = [];
    state.audioBlob = null;
    els.micBtn.classList.remove('recording');
    els.audioIndicator.classList.remove('active');
    clearInterval(state.recordingTimer);
}

function updateRecordingTimer() {
    state.recordingSeconds++;
    const mins = Math.floor(state.recordingSeconds / 60);
    const secs = state.recordingSeconds % 60;
    els.audioTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function initWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        
        recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const transcript = event.results[last][0].transcript.toLowerCase();
            
            // Smart Stop: If user says shutdown or stop, halt immediately
            if (transcript.includes('stop') || transcript.includes('shut down') || transcript.includes('shutdown') || transcript.includes('sleep')) {
                stopSpeaking();
                if (state.isStreaming) stopStreaming();
                return;
            }

            if (transcript.includes('jarvis') && !state.isRecording && !state.isStreaming) {
                // Wake word detected
                toggleRecording();
            }
        };
        
        recognition.onend = () => {
            // Keep listening indefinitely unless recording
            if (!state.isRecording) {
                try { recognition.start(); } catch(e) {}
            }
        };
        
        try {
            recognition.start();
        } catch (e) {
            console.log("Wake word engine could not start automatically.");
        }
    } else {
        console.warn("Wake word not supported in this browser. Use Spacebar for Push-to-Talk.");
    }
}

// ============================================================
// INPUT HANDLING
// ============================================================

function clearAttachment() {
    state.attachedImage = null;
    state.attachedImageMime = null;
    if (els.imagePreview) els.imagePreview.src = '';
    if (els.attachmentPreviewContainer) els.attachmentPreviewContainer.classList.add('hidden');
    if (els.fileInput) els.fileInput.value = '';
    handleInputChange();
}

async function captureWebcamSnapshot() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        els.webcamVideo.srcObject = stream;
        
        await new Promise(resolve => {
            els.webcamVideo.onloadedmetadata = () => {
                resolve();
            };
        });
        
        await els.webcamVideo.play();
        
        // Flash animation
        document.body.classList.add('flash-animation');
        setTimeout(() => document.body.classList.remove('flash-animation'), 200);

        // Draw to canvas
        els.webcamCanvas.width = els.webcamVideo.videoWidth;
        els.webcamCanvas.height = els.webcamVideo.videoHeight;
        const ctx = els.webcamCanvas.getContext('2d');
        ctx.drawImage(els.webcamVideo, 0, 0, els.webcamCanvas.width, els.webcamCanvas.height);
        
        // Stop stream
        stream.getTracks().forEach(track => track.stop());
        els.webcamVideo.srcObject = null;
        
        // Extract Base64
        const dataUrl = els.webcamCanvas.toDataURL('image/jpeg', 0.8);
        const base64String = dataUrl.split(',')[1];
        
        // Update State
        state.attachedImage = base64String;
        state.attachedImageMime = 'image/jpeg';
        els.imagePreview.src = dataUrl;
        els.attachmentPreviewContainer.classList.remove('hidden');
        handleInputChange();
        
    } catch (err) {
        console.error('Webcam access denied or failed:', err);
        alert('Webcam access is required to take a picture. Please allow camera access in your browser settings.');
    }
}

async function handleFileSelection(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            els.imagePreview.src = event.target.result;
            const base64String = event.target.result.split(',')[1];
            state.attachedImage = base64String;
            state.attachedImageMime = file.type;
            els.attachmentPreviewContainer.classList.remove('hidden');
            handleInputChange();
        };
        reader.readAsDataURL(file);
    } else if (file.type === 'text/plain' || file.type === 'application/pdf' || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
        await uploadDocument(file);
    } else {
        alert("Unsupported file type. Please upload images, TXT, or PDF files.");
    }
}

async function uploadDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const msgDiv = appendMessageBubble('user', `Uploading document: ${file.name}...`);
    
    try {
        const response = await fetch(`${API_BASE}/api/documents`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Upload failed");
        }
        
        const data = await response.json();
        msgDiv.innerHTML = `<div class="message-content"><div class="message-role">System</div><div class="message-text">✅ Document <b>${file.name}</b> successfully ingested and added to RAG memory! (${data.chunks_added} chunks processed).</div></div>`;
        if (els.fileInput) els.fileInput.value = '';
    } catch (e) {
        msgDiv.innerHTML = `<div class="message-content"><div class="message-role">System</div><div class="message-text">❌ Failed to upload document: ${e.message}</div></div>`;
    }
}

function handleInputChange() {
    // If the user types anything, immediately stop Jarvis from speaking
    if (els.messageInput.value.length > 0) {
        stopSpeaking();
    }

    const hasText = els.messageInput.value.trim().length > 0;
    const hasMedia = state.attachedImage !== null || state.audioBlob !== null;
    els.sendBtn.disabled = (!hasText && !hasMedia) && !state.isStreaming;

    // Auto-resize textarea
    els.messageInput.style.height = 'auto';
    els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 160) + 'px';
}

function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!els.sendBtn.disabled) sendMessage();
    }
}

// ============================================================
// SIDEBAR
// ============================================================

function toggleSidebar() {
    els.sidebar.classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function closeSidebar() {
    els.sidebar.classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

// ============================================================
// MARKDOWN RENDERER
// ============================================================

function renderMarkdown(text) {
    if (!text) return '';

    let html = escapeHtml(text);

    // Code blocks (``` ```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || 'plaintext';
        const id = 'code-' + Math.random().toString(36).substr(2, 9);
        return `<pre><div class="code-header"><span>${language}</span><button class="copy-btn" onclick="copyCode('${id}')">Copy</button></div><code id="${id}">${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Line breaks → paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
        html = '<p>' + html + '</p>';
    }

    return html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global function for copy buttons in code blocks
window.copyCode = function(id) {
    const codeEl = document.getElementById(id);
    if (codeEl) {
        navigator.clipboard.writeText(codeEl.textContent).then(() => {
            const btn = codeEl.closest('pre').querySelector('.copy-btn');
            if (btn) {
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
            }
        });
    }
};
