const sounds = {
    stack: new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3'),
    fall: new Audio('https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3'),
    gameOver: new Audio('https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3')
};

export function preloadSounds() {
    Object.values(sounds).forEach(sound => {
        sound.load();
        sound.volume = 0.3;
        sound.onerror = function() {
            console.log('Error loading sound:', sound.src);
        };
    });
}

export function playSound(soundName) {
    try {
        const sound = sounds[soundName];
        if (sound) {
            const soundInstance = sound.cloneNode();
            soundInstance.play().catch(e => {
                console.log('Sound play failed:', e);
            });
        }
    } catch (error) {
        console.error('Error playing sound:', error);
    }
}

export function toggleMute(muted) {
    Object.values(sounds).forEach(sound => {
        sound.muted = muted;
    });
}

export default sounds; 