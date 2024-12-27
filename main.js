window.focus(); // Capture keys right away (by default focus is on editor)

let camera, scene, renderer; // ThreeJS globals
let world; // CannonJs world
let lastTime; // Last timestamp of animation
let stack; // Parts that stay solid on top of each other
let overhangs; // Overhanging parts that fall down
const boxHeight = 1; // Height of each layer
const originalBoxSize = 3; // Original width and height of a box
let autopilot;
let gameEnded;
let robotPrecision; // Determines how precise the game is on autopilot
let isPaused = false;
let highScore = localStorage.getItem('stackGameHighScore') || 0;
const gameStates = {
    READY: 'ready',
    PLAYING: 'playing',
    PAUSED: 'paused',
    ENDED: 'ended'
};
let gameState = gameStates.READY;
let difficulty = 'medium';
const difficultySettings = {
    easy: { speed: 0.006, precision: 0.8 },
    medium: { speed: 0.008, precision: 0.5 },
    hard: { speed: 0.01, precision: 0.3 }
};

// Add sound effects
const sounds = {
    stack: new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgA'),
    fall: new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgA'),
    gameOver: new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgA')
};

const scoreElement = document.getElementById("score");
const instructionsElement = document.getElementById("instructions");
const resultsElement = document.getElementById("results");

init();

// Determines how precise the game is on autopilot
function setRobotPrecision() {
    const precisionRange = difficultySettings[difficulty].precision;
    robotPrecision = Math.random() * precisionRange - (precisionRange / 2);
}

function init() {
    autopilot = true;
    gameEnded = false;
    lastTime = 0;
    stack = [];
    overhangs = [];
    setRobotPrecision();
    gameState = gameStates.READY;

    // Initialize CannonJS
    world = new CANNON.World();
    world.gravity.set(0, -10, 0); // Gravity pulls things down
    world.broadphase = new CANNON.NaiveBroadphase();
    world.solver.iterations = 40;

    // Initialize ThreeJs
    const aspect = window.innerWidth / window.innerHeight;
    const width = 10;
    const height = width / aspect;

    camera = new THREE.OrthographicCamera(
        width / -2, // left
        width / 2, // right
        height / 2, // top
        height / -2, // bottom
        0, // near plane
        100 // far plane
    );

    /*
    // If you want to use perspective camera instead, uncomment these lines
    camera = new THREE.PerspectiveCamera(
        45, // field of view
        aspect, // aspect ratio
        1, // near plane
        100 // far plane
    );
    */

    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    scene = new THREE.Scene();
    scene.background = new THREE.Color('#1a1a1a'); // Dark background for better neon contrast

    // Foundation
    addLayer(0, 0, originalBoxSize, originalBoxSize);

    // First layer
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");

    // Set up lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 0);
    scene.add(dirLight);

    // Add point lights for more dramatic effect
    const pointLight1 = new THREE.PointLight(0xff1177, 0.5);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x00ffff, 0.5);
    pointLight2.position.set(-10, 10, -10);
    scene.add(pointLight2);

    // Set up renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setAnimationLoop(animation);
    document.body.appendChild(renderer.domElement);
}

function startGame() {
    if (gameState === gameStates.PAUSED) {
        return;
    }
    
    try {
        restartGame();
    } catch (error) {
        console.error('Error starting game:', error);
        gameState = gameStates.ENDED;
    }
}

function addLayer(x, z, width, depth, direction) {
    const y = boxHeight * stack.length; // Add the new box one layer higher
    const layer = generateBox(x, y, z, width, depth, false);
    layer.direction = direction;
    stack.push(layer);
}

function addOverhang(x, z, width, depth) {
    const y = boxHeight * (stack.length - 1); // Add the new box one the same layer
    const overhang = generateBox(x, y, z, width, depth, true);
    overhangs.push(overhang);
}

function generateBox(x, y, z, width, depth, falls) {
    // ThreeJS
    const geometry = new THREE.BoxGeometry(width, boxHeight, depth);
    
    // Neon color palette
    const neonColors = [
        '#ff1177', // hot pink
        '#00ffff', // cyan
        '#ff9900', // orange
        '#39ff14', // neon green
        '#cc00ff', // purple
        '#ff3131', // neon red
    ];
    
    const color = new THREE.Color(neonColors[stack.length % neonColors.length]);
    const material = new THREE.MeshLambertMaterial({ 
        color,
        emissive: color,
        emissiveIntensity: 0.2
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    scene.add(mesh);

    // CannonJS
    const shape = new CANNON.Box(
        new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2)
    );
    let mass = falls ? 5 : 0;
    mass *= width / originalBoxSize;
    mass *= depth / originalBoxSize;
    const body = new CANNON.Body({ mass, shape });
    body.position.set(x, y, z);
    world.addBody(body);

    return {
        threejs: mesh,
        cannonjs: body,
        width,
        depth
    };
}

function cutBox(topLayer, overlap, size, delta) {
    const direction = topLayer.direction;
    const newWidth = direction == "x" ? overlap : topLayer.width;
    const newDepth = direction == "z" ? overlap : topLayer.depth;

    // Update metadata
    topLayer.width = newWidth;
    topLayer.depth = newDepth;

    // Update ThreeJS model
    topLayer.threejs.scale[direction] = overlap / size;
    topLayer.threejs.position[direction] -= delta / 2;

    // Update CannonJS model
    topLayer.cannonjs.position[direction] -= delta / 2;

    // Replace shape to a smaller one (in CannonJS you can't simply just scale a shape)
    const shape = new CANNON.Box(
        new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2)
    );
    topLayer.cannonjs.shapes = [];
    topLayer.cannonjs.addShape(shape);
}

function updateGameState(newState) {
    gameState = newState;
    
    switch(newState) {
        case gameStates.READY:
            if (instructionsElement) instructionsElement.style.display = "flex";
            if (resultsElement) resultsElement.style.display = "none";
            if (document.getElementById('pause-menu')) {
                document.getElementById('pause-menu').style.display = "none";
            }
            break;
        case gameStates.PLAYING:
            if (instructionsElement) instructionsElement.style.display = "none";
            if (resultsElement) resultsElement.style.display = "none";
            if (document.getElementById('pause-menu')) {
                document.getElementById('pause-menu').style.display = "none";
            }
            break;
        case gameStates.PAUSED:
            if (document.getElementById('pause-menu')) {
                document.getElementById('pause-menu').style.display = "flex";
            }
            break;
        case gameStates.ENDED:
            if (resultsElement) resultsElement.style.display = "flex";
            if (document.getElementById('pause-menu')) {
                document.getElementById('pause-menu').style.display = "none";
            }
            updateHighScore();
            break;
    }
}

function updateHighScore() {
    const currentScore = stack.length - 1;
    if (currentScore > highScore) {
        highScore = currentScore;
        localStorage.setItem('stackGameHighScore', highScore);
        // Update UI to show new high score
        if (resultsElement) {
            const highScoreDiv = document.createElement('p');
            highScoreDiv.innerText = `New High Score: ${highScore}!`;
            resultsElement.querySelector('.content').appendChild(highScoreDiv);
        }
    }
}

function togglePause() {
    if (gameState !== gameStates.PLAYING && gameState !== gameStates.PAUSED) {
        return;
    }
    
    isPaused = !isPaused;
    updateGameState(isPaused ? gameStates.PAUSED : gameStates.PLAYING);
}

function initializeEventListeners() {
    const eventOptions = { passive: false };
    
    window.addEventListener("mousedown", eventHandler, eventOptions);
    window.addEventListener("touchstart", (e) => {
        e.preventDefault();
        eventHandler();
    }, eventOptions);
    
    window.addEventListener("keydown", function(event) {
        switch(event.key.toLowerCase()) {
            case " ":
                event.preventDefault();
                eventHandler();
                break;
            case "r":
                event.preventDefault();
                startGame();
                break;
            case "p":
                event.preventDefault();
                togglePause();
                break;
            case "m":
                // Toggle mute all sounds
                toggleMute();
                break;
        }
    }, eventOptions);
}

function toggleMute() {
    Object.values(sounds).forEach(sound => {
        sound.muted = !sound.muted;
    });
}

function eventHandler() {
    if (autopilot) startGame();
    else splitBlockAndAddNextOneIfOverlaps();
}

function splitBlockAndAddNextOneIfOverlaps() {
    if (gameEnded || isPaused) return;

    try {
        const topLayer = stack[stack.length - 1];
        const previousLayer = stack[stack.length - 2];

        const direction = topLayer.direction;

        const size = direction == "x" ? topLayer.width : topLayer.depth;
        const delta =
            topLayer.threejs.position[direction] -
            previousLayer.threejs.position[direction];
        const overhangSize = Math.abs(delta);
        const overlap = size - overhangSize;

        if (overlap > 0) {
            sounds.stack.play().catch(e => console.log('Sound play failed'));
            cutBox(topLayer, overlap, size, delta);

            // Overhang
            const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
            const overhangX =
                direction == "x"
                    ? topLayer.threejs.position.x + overhangShift
                    : topLayer.threejs.position.x;
            const overhangZ =
                direction == "z"
                    ? topLayer.threejs.position.z + overhangShift
                    : topLayer.threejs.position.z;
            const overhangWidth = direction == "x" ? overhangSize : topLayer.width;
            const overhangDepth = direction == "z" ? overhangSize : topLayer.depth;

            addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

            // Next layer
            const nextX = direction == "x" ? topLayer.threejs.position.x : -10;
            const nextZ = direction == "z" ? topLayer.threejs.position.z : -10;
            const newWidth = topLayer.width; // New layer has the same size as the cut top layer
            const newDepth = topLayer.depth; // New layer has the same size as the cut top layer
            const nextDirection = direction == "x" ? "z" : "x";

            if (scoreElement) scoreElement.innerText = stack.length - 1;
            addLayer(nextX, nextZ, newWidth, newDepth, nextDirection);
        } else {
            sounds.fall.play().catch(e => console.log('Sound play failed'));
            missedTheSpot();
        }
    } catch (error) {
        console.error('Error in split block:', error);
        gameState = gameStates.ENDED;
    }
}

function missedTheSpot() {
    const topLayer = stack[stack.length - 1];

    // Turn to top layer into an overhang and let it fall down
    addOverhang(
        topLayer.threejs.position.x,
        topLayer.threejs.position.z,
        topLayer.width,
        topLayer.depth
    );
    world.remove(topLayer.cannonjs);
    scene.remove(topLayer.threejs);

    gameEnded = true;
    updateGameState(gameStates.ENDED);
}

function animation(time) {
    if (isPaused) {
        lastTime = time;
        return;
    }

    if (lastTime) {
        try {
            const timePassed = time - lastTime;
            const speed = difficultySettings[difficulty].speed;  // Use difficulty speed

            const topLayer = stack[stack.length - 1];
            const previousLayer = stack[stack.length - 2];

            // The top level box should move if the game has not ended AND
            // it's either NOT in autopilot or it is in autopilot and the box did not yet reach the robot position
            const boxShouldMove =
                !gameEnded &&
                (!autopilot ||
                    (autopilot &&
                        topLayer.threejs.position[topLayer.direction] <
                            previousLayer.threejs.position[topLayer.direction] +
                                robotPrecision));

            if (boxShouldMove) {
                // Keep the position visible on UI and the position in the model in sync
                topLayer.threejs.position[topLayer.direction] += speed * timePassed;
                topLayer.cannonjs.position[topLayer.direction] += speed * timePassed;

                // If the box went beyond the stack then show up the fail screen
                if (topLayer.threejs.position[topLayer.direction] > 10) {
                    missedTheSpot();
                }
            } else {
                // If it shouldn't move then is it because the autopilot reached the correct position?
                // Because if so then next level is coming
                if (autopilot) {
                    splitBlockAndAddNextOneIfOverlaps();
                    setRobotPrecision();
                }
            }

            // 4 is the initial camera height
            if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
                camera.position.y += speed * timePassed;
            }

            updatePhysics(timePassed);
            renderer.render(scene, camera);
        } catch (error) {
            console.error('Animation error:', error);
            gameState = gameStates.ENDED;
        }
    }
    lastTime = time;
}

function updatePhysics(timePassed) {
    try {
        world.step(timePassed / 1000);
        
        overhangs.forEach((element) => {
            if (element && element.threejs && element.cannonjs) {
                element.threejs.position.copy(element.cannonjs.position);
                element.threejs.quaternion.copy(element.cannonjs.quaternion);
            }
        });
    } catch (error) {
        console.error('Physics update error:', error);
    }
}

window.addEventListener("resize", () => {
    // Adjust camera
    console.log("resize", window.innerWidth, window.innerHeight);
    const aspect = window.innerWidth / window.innerHeight;
    const width = 10;
    const height = width / aspect;

    camera.top = height / 2;
    camera.bottom = height / -2;

    // Reset renderer
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
});

// Add this helper function to clear the scene
function clearScene() {
    // Remove all meshes and lights from the scene
    while (scene.children.length > 0) {
        scene.remove(scene.children[0]);
    }

    // Remove all physics bodies
    if (world) {
        while (world.bodies.length > 0) {
            world.remove(world.bodies[0]);
        }
    }

    // Re-add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 0);
    scene.add(dirLight);

    const pointLight1 = new THREE.PointLight(0xff1177, 0.5);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x00ffff, 0.5);
    pointLight2.position.set(-10, 10, -10);
    scene.add(pointLight2);
}

// Initialize event listeners when the game starts
initializeEventListeners();

// Add this new function
function initializeGame() {
    // Reset score
    if (scoreElement) scoreElement.innerText = 0;
    
    // Foundation
    addLayer(0, 0, originalBoxSize, originalBoxSize);

    // First layer
    addLayer(-10, 0, originalBoxSize, originalBoxSize, "x");
    
    // Reset camera
    if (camera) {
        camera.position.set(4, 4, 4);
        camera.lookAt(0, 0, 0);
    }
}

// Add this to update the high score display
function updateHighScoreDisplay() {
    const highScoreElement = document.getElementById('high-score');
    if (highScoreElement) {
        highScoreElement.innerText = `High Score: ${highScore}`;
    }
}

// Call this at the end of the file
updateHighScoreDisplay();

// Add these functions for menu handling
function initializeMenus() {
    // Play button
    document.getElementById('play-button').addEventListener('click', () => {
        document.getElementById('title-screen').style.display = 'none';
        document.getElementById('game-ui').style.display = 'block';
        startGame();
    });

    // Settings button
    document.getElementById('settings-button').addEventListener('click', () => {
        document.getElementById('settings-menu').style.display = 'flex';
    });

    // Instructions button
    document.getElementById('instructions-button').addEventListener('click', () => {
        document.getElementById('instructions-menu').style.display = 'flex';
    });

    // Back buttons
    document.getElementById('settings-back').addEventListener('click', () => {
        document.getElementById('settings-menu').style.display = 'none';
    });

    document.getElementById('instructions-back').addEventListener('click', () => {
        document.getElementById('instructions-menu').style.display = 'none';
    });

    // Difficulty selector
    document.getElementById('difficulty').addEventListener('change', (e) => {
        difficulty = e.target.value;
        if (gameState === gameStates.PLAYING) {
            // If game is in progress, restart with new difficulty
            restartGame();
        }
    });

    // Sound toggle
    document.getElementById('sound-toggle').addEventListener('change', (e) => {
        Object.values(sounds).forEach(sound => {
            sound.muted = !e.target.checked;
        });
    });

    // Back to menu buttons
    document.getElementById('back-to-menu').addEventListener('click', showTitleScreen);
    document.getElementById('pause-back-to-menu').addEventListener('click', showTitleScreen);
}

function showTitleScreen() {
    document.getElementById('title-screen').style.display = 'flex';
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('results').style.display = 'none';
    document.getElementById('pause-menu').style.display = 'none';
    gameState = gameStates.READY;
    
    // Properly reset the game state
    restartGame();
    autopilot = true; // Set autopilot for title screen
}

// Call this at the end of the file
initializeMenus();

// Add this new function to handle game restart
function restartGame() {
    try {
        // Reset physics world
        world = new CANNON.World();
        world.gravity.set(0, -10, 0);
        world.broadphase = new CANNON.NaiveBroadphase();
        world.solver.iterations = 40;

        // Clear the scene and reset lights
        clearScene();
        
        // Reset game state
        autopilot = false;
        gameEnded = false;
        lastTime = 0;
        stack = [];
        overhangs = [];
        isPaused = false;
        
        // Initialize new game with current difficulty
        initializeGame();
        
        // Update game state
        updateGameState(gameStates.PLAYING);
        
        // Reset camera
        if (camera) {
            camera.position.set(4, 4, 4);
            camera.lookAt(0, 0, 0);
        }
        
        // Reset score
        if (scoreElement) scoreElement.innerText = 0;

        // Ensure renderer is properly set up
        if (renderer) {
            renderer.setAnimationLoop(animation);
        }
    } catch (error) {
        console.error('Error in restartGame:', error);
        gameState = gameStates.ENDED;
    }
}
