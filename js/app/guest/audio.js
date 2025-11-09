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

        const music = document.getElementById('button-music');
        let isPlay = false;
        let audioEl = null;
        let youtubePlayer = null;

        // Handle YouTube URLs
        if (isYouTubeUrl(url)) {
            const videoId = getYouTubeId(url);
            if (!videoId) {
                progress.invalid('audio');
                return;
            }

            try {
                await loadYouTubeAPI();
                
                // Create hidden iframe container
                const container = document.createElement('div');
                container.id = 'youtube-audio-player';
                container.style.cssText = 'position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; z-index: -1;';
                document.body.appendChild(container);

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
                        rel: 0
                    },
                    events: {
                        onReady: () => {
                            progress.complete('audio');
                            // Set up loop
                            youtubePlayer.setLoop(true);
                        },
                        onStateChange: (event) => {
                            if (event.data === window.YT.PlayerState.ENDED) {
                                youtubePlayer.playVideo();
                            }
                        }
                    }
                });

                const play = async () => {
                    if (!navigator.onLine || !music || !youtubePlayer) {
                        return;
                    }

                    music.disabled = true;
                    try {
                        youtubePlayer.playVideo();
                        isPlay = true;
                        music.disabled = false;
                        music.innerHTML = statePlay;
                    } catch (err) {
                        isPlay = false;
                        util.notify(err).error();
                    }
                };

                const pause = () => {
                    isPlay = false;
                    if (youtubePlayer) {
                        youtubePlayer.pauseVideo();
                    }
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
            } catch (err) {
                progress.invalid('audio');
                return;
            }
        }

        // Handle regular audio files
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