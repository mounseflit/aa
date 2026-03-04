/**
 * Interactive Avatar Application
 * Free-form conversational avatar with random video cycling and AI-powered Q&A matching
 */

class AvatarApp {
    constructor() {
        // Configuration
        this.transitionDuration = 400; // ms for crossfade

        // Asset paths (matching actual folder names)
        this.paths = {
            idle: './assets/Idles/',
            listening: './assets/listening/',
            speaking: './assets/Speaking/',
            audio: './assets/audio/'
        };

        // Generic video pools for random cycling
        this.idleVideos = ['idle_1.mp4', 'idle_2.mp4', 'idle_3.mp4', 'idle_4.mp4'];
        this.listenVideos = ['listen_1.mp4', 'listen_2.mp4', 'listen_3.mp4', 'listen_4.mp4'];

        // State machine
        this.state = {
            phase: 'idle', // 'idle' | 'listening' | 'processing' | 'speaking'
            isButtonPressed: false,
            isTransitioning: false,
            started: false,
            audioEnabled: false
        };

        // Track last played index to avoid immediate repeats
        this.lastIdleIndex = -1;
        this.lastListenIndex = -1;

        // DOM Elements
        this.elements = {
            videoA: document.getElementById('videoA'),
            videoB: document.getElementById('videoB'),
            baseImage: document.getElementById('baseImage'),
            stateText: document.getElementById('stateText'),
            videoName: document.getElementById('videoName'),
            videoTimer: document.getElementById('videoTimer'),
            pushToTalkBtn: document.getElementById('pushToTalk'),
            buttonHint: document.getElementById('buttonHint'),
            toggleUIBtn: document.getElementById('toggleUI'),
            uiOverlay: document.getElementById('uiOverlay'),
            transcriptionContainer: document.getElementById('transcriptionContainer'),
            transcriptionText: document.getElementById('transcriptionText'),
            transcriptionStatus: document.getElementById('transcriptionStatus')
        };

        // Questions data
        this.questions = [];

        // Settings data
        this.settings = {};

        // Speech Recognition
        this.recognition = null;
        this.transcribedText = '';
        this.lastInterimTranscript = '';
        this.isRecognizing = false;

        // Video management
        this.activeVideo = 'A';
        this.timerInterval = null;
        this.playId = 0; // Counter to cancel stale playVideo calls

        this.init();
    }

    async init() {
        await this.loadSettings();
        await this.loadQuestions();
        this.setupEventListeners();
        await this.setupSpeechRecognition();
        this.updateState('idle');
        this.setupBaseImage();
        this.startExperience();
    }

    // ==================== SETTINGS & DATA ====================

    async loadSettings() {
        try {
            const response = await fetch('./assets/settings.json');
            this.settings = await response.json();

            // Set page title from avatar name
            if (this.settings.name) {
                document.title = this.settings.name;
            }

            // Set base image from settings
            if (this.settings.base_image_filename) {
                this.elements.baseImage.src = `./assets/${this.settings.base_image_filename}`;
            }

            console.log('[App] Settings loaded:', this.settings.name);
        } catch (err) {
            console.error('[App] Error loading settings:', err);
        }
    }

    async loadQuestions() {
        try {
            const response = await fetch('./assets/qst.json');
            const data = await response.json();
            this.questions = data.questions;
            console.log('[App] Loaded', this.questions.length, 'questions');
        } catch (err) {
            console.error('[App] Error loading questions:', err);
            this.questions = [];
        }
    }

    setupBaseImage() {
        this.elements.baseImage.onerror = () => {
            this.elements.baseImage.style.display = 'none';
        };
    }

    // ==================== SPEECH RECOGNITION ====================

    async setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.warn('[SpeechRecognition] Not supported in this browser');
            return;
        }

        await this.requestMicrophonePermission();

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        // Set language from settings, default to en-US
        this.recognition.lang = (this.settings && this.settings.language) || 'en-US';
        console.log('[SpeechRecognition] Language:', this.recognition.lang);

        this.recognition.onstart = () => {
            console.log('[SpeechRecognition] Started');
            this.isRecognizing = true;
            this.elements.transcriptionContainer.classList.add('visible');
            this.elements.transcriptionText.textContent = this.transcribedText || '...';
            this.updateTranscriptionStatus('recording');
        };

        // Track interim results so we can capture them on button release
        this.lastInterimTranscript = '';

        this.recognition.onresult = (event) => {
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    this.transcribedText += transcript + ' ';
                    console.log('[SpeechRecognition] Final:', transcript);
                } else {
                    interimTranscript += transcript;
                }
            }

            // Always track interim text so it can be captured on release
            this.lastInterimTranscript = interimTranscript;

            const displayText = (this.transcribedText + interimTranscript).trim();
            this.elements.transcriptionText.textContent = displayText || '...';
            console.log('[SpeechRecognition] Current:', displayText);
        };

        this.recognition.onerror = (event) => {
            console.error('[SpeechRecognition] Error:', event.error);

            if (event.error === 'not-allowed') {
                console.warn('[SpeechRecognition] Microphone permission denied.');
                this.elements.transcriptionText.textContent = 'Microphone access denied';
                this.updateTranscriptionStatus('gibberish');
                this.isRecognizing = false;
            } else if (event.error === 'no-speech') {
                // Normal during silence - onend will handle restart
                console.log('[SpeechRecognition] No speech detected, continuing...');
            } else if (event.error === 'network') {
                console.warn('[SpeechRecognition] Network error');
                // Don't kill isRecognizing if button held - let onend handle restart
                if (!this.state.isButtonPressed) {
                    this.isRecognizing = false;
                }
            } else if (event.error === 'aborted') {
                console.log('[SpeechRecognition] Aborted');
                // Don't kill isRecognizing if button held - let onend handle restart
                if (!this.state.isButtonPressed) {
                    this.isRecognizing = false;
                }
            }
        };

        this.recognition.onend = () => {
            console.log('[SpeechRecognition] Ended, buttonPressed:', this.state.isButtonPressed);

            // If button is still held, ALWAYS try to restart regardless of isRecognizing state
            // Use a small delay to avoid rapid restart loops if the API keeps failing
            if (this.state.isButtonPressed) {
                console.log('[SpeechRecognition] Auto-restarting (button still held)...');
                setTimeout(() => {
                    // Re-check button state after delay (user may have released)
                    if (!this.state.isButtonPressed) {
                        this.isRecognizing = false;
                        return;
                    }
                    try {
                        this.recognition.start();
                    } catch (err) {
                        console.error('[SpeechRecognition] Restart error:', err);
                        // Retry once more after another delay
                        setTimeout(() => {
                            if (!this.state.isButtonPressed) {
                                this.isRecognizing = false;
                                return;
                            }
                            try {
                                this.recognition.start();
                            } catch (err2) {
                                console.error('[SpeechRecognition] Final restart failed:', err2);
                                this.isRecognizing = false;
                            }
                        }, 500);
                    }
                }, 200);
            } else {
                this.isRecognizing = false;
            }
        };
    }

    async requestMicrophonePermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            console.log('[SpeechRecognition] Microphone permission granted');
            this.microphonePermission = true;
            return true;
        } catch (err) {
            console.error('[SpeechRecognition] Microphone permission denied:', err);
            this.microphonePermission = false;
            return false;
        }
    }

    async startRecognition() {
        if (!this.recognition) return;

        if (!this.microphonePermission) {
            const granted = await this.requestMicrophonePermission();
            if (!granted) {
                console.warn('[SpeechRecognition] Cannot start - no microphone permission');
                this.elements.transcriptionContainer.classList.add('visible');
                this.elements.transcriptionText.textContent = 'Please allow microphone access';
                this.updateTranscriptionStatus('gibberish');
                return;
            }
        }

        // Reset transcription for new session
        this.transcribedText = '';
        this.lastInterimTranscript = '';
        this.elements.transcriptionText.textContent = '...';

        // Try to start recognition, with retry if the previous session is still closing
        await this.tryStartRecognition(3);
    }

    async tryStartRecognition(retries) {
        if (!this.recognition || !this.state.isButtonPressed) return;

        // If already recognizing, skip
        if (this.isRecognizing) {
            console.log('[SpeechRecognition] Already recognizing, skipping start');
            return;
        }

        try {
            this.recognition.start();
            console.log('[SpeechRecognition] Starting continuous recognition...');
        } catch (err) {
            console.error('[SpeechRecognition] Start error:', err.message);
            if (retries > 0 && this.state.isButtonPressed) {
                console.log(`[SpeechRecognition] Retrying in 300ms... (${retries} retries left)`);
                await new Promise(r => setTimeout(r, 300));
                await this.tryStartRecognition(retries - 1);
            } else {
                console.error('[SpeechRecognition] Failed to start after retries');
            }
        }
    }

    stopRecognition() {
        if (this.recognition) {
            try {
                this.isRecognizing = false;
                this.recognition.stop();
                console.log('[SpeechRecognition] Stopped - Final text:', this.transcribedText.trim());
            } catch (err) {
                console.error('[SpeechRecognition] Stop error:', err);
            }
        }
    }

    updateTranscriptionStatus(status) {
        const statusEl = this.elements.transcriptionStatus;
        if (!statusEl) return;

        statusEl.className = 'transcription-status ' + status;

        const statusText = {
            'recording': 'Recording',
            'analyzing': 'Analyzing...',
            'valid': '✓ Matched',
            'out_of_context': '⚠ Off Topic',
            'gibberish': '✗ Unclear'
        };

        statusEl.textContent = statusText[status] || status;
    }

    // ==================== Q&A MATCHING ====================

    async matchQuestion() {
        const text = this.transcribedText.trim();
        console.log('[Match] Transcribed text to match:', `"${text}"`, `(${text.length} chars)`);

        if (!text || text.length === 0) {
            console.log('[Match] Empty transcription - returning gibberish');
            return 37;
        }

        if (window.guardrailAgent) {
            console.log('[Match] Agent available, calling matchQuestion...');
            try {
                const questionNumber = await window.guardrailAgent.matchQuestion(text);
                console.log('[Match] Agent returned question number:', questionNumber);
                return questionNumber;
            } catch (err) {
                console.error('[Match] Agent error:', err);
                return 36;
            }
        } else {
            console.error('[Match] Agent NOT available! window.guardrailAgent is:', window.guardrailAgent);
            return 36;
        }
    }

    // ==================== VIDEO MANAGEMENT ====================

    getRandomVideo(pool, lastIndex) {
        let index;
        do {
            index = Math.floor(Math.random() * pool.length);
        } while (index === lastIndex && pool.length > 1);
        return { index, filename: pool[index] };
    }

    preloadGenericVideos() {
        this.idleVideos.forEach(f => this.preloadVideo(`${this.paths.idle}${f}`));
        this.listenVideos.forEach(f => this.preloadVideo(`${this.paths.listening}${f}`));
    }

    preloadVideo(src) {
        const video = document.createElement('video');
        video.src = src;
        video.preload = 'auto';
        video.load();
    }

    getActiveVideoElement() {
        return this.activeVideo === 'A' ? this.elements.videoA : this.elements.videoB;
    }

    getInactiveVideoElement() {
        return this.activeVideo === 'A' ? this.elements.videoB : this.elements.videoA;
    }

    async playVideo(src, loop = false) {
        // Increment playId so any in-flight canplay from a previous call is ignored
        const currentPlayId = ++this.playId;

        return new Promise((resolve) => {
            const activeEl = this.getActiveVideoElement();
            const inactiveEl = this.getInactiveVideoElement();

            inactiveEl.src = src;
            inactiveEl.loop = loop;
            inactiveEl.currentTime = 0;
            inactiveEl.muted = !this.state.audioEnabled;
            inactiveEl.load();

            const onCanPlay = () => {
                inactiveEl.removeEventListener('canplay', onCanPlay);

                // If a newer playVideo call has started, abandon this one
                if (currentPlayId !== this.playId) {
                    resolve();
                    return;
                }

                inactiveEl.play().then(() => {
                    this.crossfadeTransition(activeEl, inactiveEl);
                    this.activeVideo = this.activeVideo === 'A' ? 'B' : 'A';
                    this.updateVideoName(src);
                    this.startTimer(inactiveEl);
                    resolve();
                }).catch(err => {
                    console.error('Video play error:', err);
                    inactiveEl.muted = true;
                    inactiveEl.play().then(() => {
                        this.crossfadeTransition(activeEl, inactiveEl);
                        this.activeVideo = this.activeVideo === 'A' ? 'B' : 'A';
                        this.updateVideoName(src);
                        this.startTimer(inactiveEl);
                        resolve();
                    }).catch(() => resolve());
                });
            };

            inactiveEl.addEventListener('canplay', onCanPlay);

            inactiveEl.onerror = () => {
                console.error('Video load error:', src);
                resolve();
            };
        });
    }

    crossfadeTransition(outgoingEl, incomingEl) {
        incomingEl.classList.add('active');
        incomingEl.classList.remove('previous', 'fading-out');

        outgoingEl.classList.add('previous');
        outgoingEl.classList.remove('active');

        setTimeout(() => {
            if (outgoingEl.classList.contains('previous')) {
                outgoingEl.classList.add('fading-out');
                outgoingEl.classList.remove('previous');

                setTimeout(() => {
                    outgoingEl.pause();
                    outgoingEl.removeAttribute('src');
                    outgoingEl.load();
                    outgoingEl.classList.remove('fading-out');
                }, this.transitionDuration + 100); // +100ms buffer to ensure CSS transition completes
            }
        }, 50);
    }

    startTimer(videoEl) {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        const updateTimer = () => {
            if (!videoEl.duration || isNaN(videoEl.duration)) {
                this.elements.videoTimer.textContent = '00:00 / 00:00';
                return;
            }
            const current = this.formatTime(videoEl.currentTime);
            const total = this.formatTime(videoEl.duration);
            this.elements.videoTimer.textContent = `${current} / ${total}`;
        };

        this.timerInterval = setInterval(updateTimer, 100);
        updateTimer();
    }

    formatTime(seconds) {
        if (isNaN(seconds)) seconds = 0;
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    waitForVideoEnd(videoElement) {
        return new Promise((resolve) => {
            if (videoElement.loop) {
                const duration = videoElement.duration || 3;
                const remaining = duration - videoElement.currentTime;
                setTimeout(resolve, remaining * 1000);
                return;
            }

            const handleEnd = () => {
                videoElement.removeEventListener('ended', handleEnd);
                resolve();
            };
            videoElement.addEventListener('ended', handleEnd);
        });
    }

    // ==================== STATE MANAGEMENT ====================

    updateState(phase) {
        this.state.phase = phase;

        const stateText = this.elements.stateText;
        stateText.className = 'value ' + phase;

        const stateNames = {
            'idle': 'Idle',
            'listening': 'Listening',
            'processing': 'Processing...',
            'speaking': 'Speaking'
        };

        stateText.textContent = stateNames[phase] || phase;
    }

    updateVideoName(src) {
        const filename = src.split('/').pop();
        this.elements.videoName.textContent = filename;
    }

    updateButtonHint(text) {
        this.elements.buttonHint.textContent = text;
    }

    // ==================== PHASE HANDLERS ====================

    startExperience() {
        this.state.started = true;
        this.state.audioEnabled = false;

        this.preloadGenericVideos();
        this.startIdlePhase();

        // Unmute on first user interaction
        const unmute = () => {
            this.state.audioEnabled = true;
            this.elements.videoA.muted = false;
            this.elements.videoB.muted = false;
            document.removeEventListener('click', unmute);
            document.removeEventListener('keydown', unmute);
            document.removeEventListener('touchstart', unmute);
        };
        document.addEventListener('click', unmute);
        document.addEventListener('keydown', unmute);
        document.addEventListener('touchstart', unmute);
    }

    async startIdlePhase(delayHideTranscription = false) {
        this.updateState('idle');
        this.updateButtonHint('Press and hold while speaking');
        this.elements.buttonHint.classList.remove('recording');
        this.elements.pushToTalkBtn.classList.remove('disabled');

        if (delayHideTranscription) {
            setTimeout(() => {
                this.elements.transcriptionContainer.classList.remove('visible');
            }, 1500);
        } else {
            this.elements.transcriptionContainer.classList.remove('visible');
        }

        this.cycleIdleVideo();
    }

    async cycleIdleVideo() {
        if (this.state.phase !== 'idle') return;

        const { index, filename } = this.getRandomVideo(this.idleVideos, this.lastIdleIndex);
        this.lastIdleIndex = index;

        const src = `${this.paths.idle}${filename}`;
        await this.playVideo(src, false);

        // When this idle video ends, cycle to next random one
        const activeEl = this.getActiveVideoElement();

        const handleEnd = () => {
            activeEl.removeEventListener('ended', handleEnd);
            if (this.state.phase === 'idle') {
                this.cycleIdleVideo();
            }
        };
        activeEl.addEventListener('ended', handleEnd);
    }

    async startListeningPhase() {
        this.updateState('listening');
        this.updateButtonHint('Release when done speaking');
        this.elements.buttonHint.classList.add('recording');

        this.startRecognition();
        this.cycleListenVideo();
    }

    async cycleListenVideo() {
        if (this.state.phase !== 'listening') return;

        const { index, filename } = this.getRandomVideo(this.listenVideos, this.lastListenIndex);
        this.lastListenIndex = index;

        const src = `${this.paths.listening}${filename}`;
        await this.playVideo(src, false);

        // When this listen video ends, cycle to next random one
        const activeEl = this.getActiveVideoElement();

        const handleEnd = () => {
            activeEl.removeEventListener('ended', handleEnd);
            if (this.state.phase === 'listening') {
                this.cycleListenVideo();
            }
        };
        activeEl.addEventListener('ended', handleEnd);
    }

    async processAndRespond() {
        this.updateState('processing');
        this.updateButtonHint('Analyzing...');
        this.elements.buttonHint.classList.remove('recording');
        this.elements.pushToTalkBtn.classList.add('disabled');
        this.updateTranscriptionStatus('analyzing');

        // Match transcription to a question
        const matchResult = await this.matchQuestion();

        console.log('[Response] Match result: question', matchResult);

        let videoToPlay;

        if (matchResult === 37) {
            // Gibberish
            this.updateTranscriptionStatus('gibberish');
            this.updateState('speaking');
            this.elements.pushToTalkBtn.classList.add('disabled');
            videoToPlay = `${this.paths.speaking}GM13.webm`;
            console.log('[Response] Playing GM13 - gibberish');
        } else if (matchResult === 36) {
            // Out of context - randomly pick GM11 or GM12
            this.updateTranscriptionStatus('out_of_context');
            this.updateState('speaking');
            this.elements.pushToTalkBtn.classList.add('disabled');
            const gmVideos = ['GM11.webm', 'GM12.webm'];
            const gmPick = gmVideos[Math.floor(Math.random() * gmVideos.length)];
            videoToPlay = `${this.paths.speaking}${gmPick}`;
            console.log('[Response] Playing', gmPick, '- out of context');
        } else {
            // Matched question 1-35
            this.updateTranscriptionStatus('valid');
            this.updateState('speaking');
            this.elements.pushToTalkBtn.classList.add('disabled');
            videoToPlay = `${this.paths.speaking}A${matchResult}.webm`;
            console.log('[Response] Playing A' + matchResult);
        }

        this.updateButtonHint('Avatar is responding...');
        await this.playVideo(videoToPlay, false);

        // Wait for speaking video to end
        const activeEl = this.getActiveVideoElement();
        await this.waitForVideoEnd(activeEl);

        // Return to idle
        await this.startIdlePhase(true);
    }

    // ==================== EVENT HANDLERS ====================

    setupEventListeners() {
        const btn = this.elements.pushToTalkBtn;

        // UI Toggle button
        this.elements.toggleUIBtn.addEventListener('click', () => {
            this.elements.uiOverlay.classList.toggle('hidden');
        });

        // Mouse events
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.handleButtonPress();
        });

        btn.addEventListener('mouseup', (e) => {
            e.preventDefault();
            this.handleButtonRelease();
        });

        btn.addEventListener('mouseleave', () => {
            if (this.state.isButtonPressed) {
                this.handleButtonRelease();
            }
        });

        // Touch events for mobile
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.handleButtonPress();
        });

        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleButtonRelease();
        });

        btn.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.handleButtonRelease();
        });

        // Keyboard support (spacebar)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat && !this.state.isButtonPressed && this.state.started) {
                e.preventDefault();
                this.handleButtonPress();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.state.started) {
                e.preventDefault();
                this.handleButtonRelease();
            }
        });
    }

    handleButtonPress() {
        if (!this.state.started || this.state.phase !== 'idle' || this.state.isButtonPressed) {
            return;
        }

        this.state.isButtonPressed = true;
        this.elements.pushToTalkBtn.classList.add('active');
        this.startListeningPhase();
    }

    handleButtonRelease() {
        if (!this.state.isButtonPressed) {
            return;
        }

        // Capture any remaining interim transcript BEFORE setting isButtonPressed to false
        // This prevents losing speech that hasn't been finalized yet
        if (this.lastInterimTranscript) {
            this.transcribedText += this.lastInterimTranscript + ' ';
            console.log('[SpeechRecognition] Captured interim on release:', this.lastInterimTranscript);
            this.lastInterimTranscript = '';
        }

        this.state.isButtonPressed = false;
        this.elements.pushToTalkBtn.classList.remove('active');

        if (this.state.phase === 'listening') {
            // Set phase to processing to stop listen cycling
            this.state.phase = 'processing';
            this.stopRecognition();

            console.log('[SpeechRecognition] Final transcribed text for matching:', `"${this.transcribedText.trim()}"`);
            this.processAndRespond();
        }
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.avatarApp = new AvatarApp();
});
