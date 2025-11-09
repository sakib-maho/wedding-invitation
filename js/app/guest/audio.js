import { progress } from './progress.js';
import { util } from '../../common/util.js';
import { cache } from '../../connection/cache.js';

export const audio = (() => {

    const statePlay = '<i class="fa-solid fa-circle-pause spin-button"></i>';
    const statePause = '<i class="fa-solid fa-circle-play"></i>';

    /**
     * Extract YouTube video ID from URL
     * @param {string} url
     * @returns {string|null}
     */
    const getYouTubeId = (url) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    /**
     * Check if URL is a YouTube URL
     * @param {string} url
     * @returns {boolean}
     */
    const isYouTubeUrl = (url) => {
        return url.includes('youtube.com') || url.includes('youtu.be');
    };

    /**
     * Load YouTube iframe API
     * @returns {Promise<void>}
     */
    const loadYouTubeAPI = () => {
        return new Promise((resolve) => {
            if (window.YT && window.YT.Player) {
                resolve();
                return;
            }

            if (window.onYouTubeIframeAPIReady) {
                const originalCallback = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = () => {
                    originalCallback();
                    resolve();
                };
            } else {
                window.onYouTubeIframeAPIReady = () => {
                    resolve();
                };
            }

            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        });
    };

    /**
     * @param {boolean} [playOnOpen=true]
     * @returns {Promise<void>}
     */
    const load = async (playOnOpen = true) => {

        const url = document.body.getAttribute('data-audio');
        if (!url) {
            progress.complete('audio', true);
            return;
        }

        // Early check for YouTube URLs - must be handled separately
        if (isYouTubeUrl(url)) {
            const videoId = getYouTubeId(url);
            if (!videoId) {
                console.error('Invalid YouTube URL:', url);
                progress.invalid('audio');
                return;
            }
        } else {
            // Not a YouTube URL, handle as regular audio file
            const music = document.getElementById('button-music');
            let isPlay = false;
            let audioEl = null;

            try {
                audioEl = new Audio(await cache('audio').withForceCache().get(url, progress.getAbort()));
                audioEl.loop = true;
                audioEl.muted = false;
                audioEl.autoplay = false;
                audioEl.controls = false;

                progress.complete('audio');
            } catch {
                progress.invalid('audio');
                return;
            }

            /**
             * @returns {Promise<void>}
             */
            const play = async () => {
                if (!navigator.onLine || !music) {
                    return;
                }

                music.disabled = true;
                try {
                    await audioEl.play();
                    isPlay = true;
                    music.disabled = false;
                    music.innerHTML = statePlay;
                } catch (err) {
                    isPlay = false;
                    util.notify(err).error();
                }
            };

            /**
             * @returns {void}
             */
            const pause = () => {
                isPlay = false;
                audioEl.pause();
                music.innerHTML = statePause;
            };

            document.addEventListener('undangan.open', () => {
                music.classList.remove('d-none');

                if (playOnOpen) {
                    play();
                }
            });

            music.addEventListener('offline', pause);
            music.addEventListener('click', () => isPlay ? pause() : play());
            return;
        }

        // Handle YouTube URLs (only reached if isYouTubeUrl returned true)
        const music = document.getElementById('button-music');
        let isPlay = false;
        let youtubePlayer = null;

        // Handle YouTube URLs
        {
            const videoId = getYouTubeId(url);
            try {
                await loadYouTubeAPI();
                
                // Suppress YouTube postMessage warnings (harmless - YouTube API internal messages)
                const originalWarn = console.warn;
                const originalError = console.error;
                console.warn = function(...args) {
                    const message = args.join(' ');
                    if (message.includes('postMessage') && message.includes('youtube.com')) {
                        return; // Suppress YouTube postMessage warnings
                    }
                    originalWarn.apply(console, args);
                };
                console.error = function(...args) {
                    const message = args.join(' ');
                    if (message.includes('postMessage') && message.includes('youtube.com')) {
                        return; // Suppress YouTube postMessage errors
                    }
                    originalError.apply(console, args);
                };
                
                // Create hidden iframe container
                const container = document.createElement('div');
                container.id = 'youtube-audio-player';
                container.style.cssText = 'position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; z-index: -1;';
                document.body.appendChild(container);

                let playerReady = false;

                youtubePlayer = new window.YT.Player('youtube-audio-player', {
                    videoId: videoId,
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        disablekb: 1,
                        enablejsapi: 1,
                        fs: 0,
                        iv_load_policy: 3,
                        loop: 1,
                        modestbranding: 1,
                        playsinline: 1,
                        rel: 0,
                        playlist: videoId
                    },
                    events: {
                        onReady: (event) => {
                            playerReady = true;
                            progress.complete('audio');
                            try {
                                // Set up loop using playlist parameter
                                event.target.setLoop(true);
                            } catch (e) {
                                console.warn('Could not set loop:', e);
                            }
                        },
                        onStateChange: (event) => {
                            if (event.data === window.YT.PlayerState.ENDED) {
                                try {
                                    event.target.playVideo();
                                } catch (e) {
                                    console.warn('Could not replay video:', e);
                                }
                            }
                        },
                        onError: (event) => {
                            console.error('YouTube player error:', event.data);
                            progress.invalid('audio');
                        }
                    }
                });

                const play = async () => {
                    if (!navigator.onLine || !music || !youtubePlayer) {
                        return;
                    }

                    if (!playerReady) {
                        // Wait for player to be ready
                        const checkReady = setInterval(() => {
                            if (playerReady && youtubePlayer) {
                                clearInterval(checkReady);
                                play();
                            }
                        }, 100);
                        setTimeout(() => clearInterval(checkReady), 5000);
                        return;
                    }

                    music.disabled = true;
                    try {
                        const state = youtubePlayer.getPlayerState();
                        if (state === window.YT.PlayerState.PLAYING) {
                            isPlay = true;
                            music.disabled = false;
                            music.innerHTML = statePlay;
                            return;
                        }
                        youtubePlayer.playVideo();
                        isPlay = true;
                        music.disabled = false;
                        music.innerHTML = statePlay;
                    } catch (err) {
                        isPlay = false;
                        music.disabled = false;
                        console.error('Error playing YouTube video:', err);
                        // Don't show error notification, just log it
                    }
                };

                const pause = () => {
                    isPlay = false;
                    if (youtubePlayer && playerReady) {
                        try {
                            youtubePlayer.pauseVideo();
                        } catch (e) {
                            console.warn('Could not pause video:', e);
                        }
                    }
                    music.innerHTML = statePause;
                };

                document.addEventListener('undangan.open', () => {
                    if (music) {
                        music.classList.remove('d-none');
                        if (playOnOpen) {
                            play();
                        }
                    }
                });

                if (music) {
                    music.addEventListener('offline', pause);
                    music.addEventListener('click', () => isPlay ? pause() : play());
                }
                return;
            } catch (err) {
                console.error('Error loading YouTube audio:', err);
                progress.invalid('audio');
                return;
            }
        }
    };

    /**
     * @returns {object}
     */
    const init = () => {
        progress.add();

        return {
            load,
        };
    };

    return {
        init,
    };
})();