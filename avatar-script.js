(function () {
    const AVATAR_URL = 'https://aa-beta-six.vercel.app';

    // 1. Inject styles
    const css = `
        #av-widget-bubble {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6D4794, #9b59b6);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 999999;
            border: none;
            padding: 0;
            box-shadow: 0 4px 15px rgba(109, 71, 148, 0.5);
            transition: transform 0.3s, box-shadow 0.3s;
            animation: av-pulse 2s ease-in-out infinite;
        }
        #av-widget-bubble:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 25px rgba(109, 71, 148, 0.7);
        }
        #av-widget-bubble.active {
            animation: none;
            background: linear-gradient(135deg, #502d6e, #6D4794);
        }
        #av-widget-bubble svg {
            width: 22px;
            height: 22px;
            fill: white;
            transition: transform 0.3s;
        }
        #av-widget-bubble .av-icon-close { display: none; }
        #av-widget-bubble.active .av-icon-chat { display: none; }
        #av-widget-bubble.active .av-icon-close { display: block; }

        @keyframes av-pulse {
            0%, 100% {
                box-shadow: 0 4px 15px rgba(109, 71, 148, 0.5), 0 0 0 0 rgba(109, 71, 148, 0.4);
            }
            50% {
                box-shadow: 0 4px 15px rgba(109, 71, 148, 0.5), 0 0 0 10px rgba(109, 71, 148, 0);
            }
        }

        #av-widget-window {
            position: fixed;
            bottom: 86px;
            right: 24px;
            width: 340px;
            height: 500px;
            border-radius: 16px;
            z-index: 999998;
            overflow: hidden;
            opacity: 0;
            pointer-events: none;
            transform: translateY(15px) scale(0.95);
            transition: opacity 0.35s ease, transform 0.35s ease;
        }
        #av-widget-window.open {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0) scale(1);
        }

        /* Animated purple border ring */
        #av-widget-window::before {
            content: '';
            position: absolute;
            top: -2px; left: -2px; right: -2px; bottom: -2px;
            border-radius: 18px;
            background: linear-gradient(135deg, #6D4794, #9b59b6, #7E52A8, #b388d9);
            background-size: 300% 300%;
            z-index: -1;
            animation: av-glow 4s ease infinite;
        }

        /* Blurred outer glow */
        #av-widget-window::after {
            content: '';
            position: absolute;
            top: -6px; left: -6px; right: -6px; bottom: -6px;
            border-radius: 22px;
            background: linear-gradient(135deg, rgba(109,71,148,0.45), transparent, rgba(155,89,182,0.45), transparent);
            background-size: 300% 300%;
            z-index: -2;
            filter: blur(10px);
            animation: av-glow 4s ease infinite;
        }

        @keyframes av-glow {
            0%   { background-position: 0% 50%; }
            50%  { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        #av-widget-window iframe {
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 16px;
            display: block;
            background: #0d0d0d;
        }

        @media (max-width: 480px) {
            #av-widget-window {
                width: calc(100% - 16px);
                right: 8px;
                bottom: 82px;
                height: 420px;
            }
            #av-widget-bubble {
                bottom: 18px;
                right: 18px;
            }
        }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // 2. Inject HTML
    const bubble = document.createElement('button');
    bubble.id = 'av-widget-bubble';
    bubble.innerHTML = `
        <svg class="av-icon-chat" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <svg class="av-icon-close" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
    `;

    const win = document.createElement('div');
    win.id = 'av-widget-window';
    win.innerHTML = `<iframe src="${AVATAR_URL}" allow="microphone; camera; autoplay" allowfullscreen></iframe>`;

    document.body.appendChild(win);
    document.body.appendChild(bubble);

    // 3. Toggle
    bubble.addEventListener('click', function () {
        win.classList.toggle('open');
        bubble.classList.toggle('active');
    });
})();
