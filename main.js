// main.js
// Jogo 2D inspirado em Hollow Knight: Exploração, terror atmosférico, lore ambiental e puzzles.
// Usa Canvas 2D, roda offline, compatível PC/mobile.
// Estrutura: Salas conectadas, movimento, colisões, espíritos, puzzle simples.
// Controles: Teclado (setas/WASD + espaço) ou toque (esquerda/direita/pulo).

// Configurações globais
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// Redimensiona canvas em resize
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
});

// Áudio: Web Audio API para som ambiente simples (ruído branco para terror)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let noiseNode = null;
function startAmbientSound() {
    if (noiseNode) return;
    const bufferSize = 4096;
    noiseNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
    noiseNode.onaudioprocess = (e) => {
        const output = e.outputBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1; // Ruído branco baixo
        }
    };
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 0.05; // Volume baixo para atmosfera
    noiseNode.connect(gainNode);
    gainNode.connect(audioCtx.destination);
}

// Jogador
const player = {
    x: 100,
    y: height - 100,
    width: 20,
    height: 30,
    speed: 5,
    jumpSpeed: 15,
    velocityY: 0,
    gravity: 0.8,
    isJumping: false,
    health: 3, // Máscaras de vida (3 iniciais)
    facingRight: true
};

// Salas: Array de objetos, cada sala tem plataformas, portas, espíritos, puzzles
const rooms = [
    // Sala 1: Inicial, com lore e espírito observador
    {
        id: 0,
        backgroundColor: '#111',
        platforms: [
            {x: 0, y: height - 50, width: width, height: 50}, // Chão
            {x: 200, y: height - 150, width: 100, height: 10} // Plataforma
        ],
        doors: [
            {x: width - 50, y: height - 100, width: 30, height: 50, toRoom: 1} // Porta direita
        ],
        spirits: [
            {x: 300, y: height - 200, radius: 10, type: 'observer', visible: true} // Observa
        ],
        lore: [
            {x: 100, y: height - 200, text: 'Aqui, o som foi proibido.'} // Frase lore
        ],
        puzzles: [], // Nenhum puzzle aqui
        darkAreas: [] // Áreas escuras
    },
    // Sala 2: Com puzzle de observação (ficar parado revela símbolo que abre porta bloqueada)
    {
        id: 1,
        backgroundColor: '#222',
        platforms: [
            {x: 0, y: height - 50, width: width, height: 50}, // Chão
            {x: 400, y: height - 200, width: 150, height: 10} // Plataforma
        ],
        doors: [
            {x: 20, y: height - 100, width: 30, height: 50, toRoom: 0}, // Porta esquerda
            {x: width - 50, y: height - 100, width: 30, height: 50, toRoom: 2, blocked: true} // Porta direita bloqueada
        ],
        spirits: [
            {x: 500, y: height - 250, radius: 15, type: 'blocker', visible: true} // Bloqueia se não resolvido
        ],
        lore: [
            {x: 600, y: height - 300, text: 'Sombras sussurram segredos.'}
        ],
        puzzles: [
            {type: 'observation', x: 300, y: height - 100, radius: 20, revealed: false, timer: 0, requiredTime: 100} // Ficar parado 100 frames revela
        ],
        darkAreas: [
            {x: width / 2, y: height / 2, radius: 200} // Área escura no centro
        ]
    },
    // Sala 3: Final simples, com espírito e lore
    {
        id: 2,
        backgroundColor: '#333',
        platforms: [
            {x: 0, y: height - 50, width: width, height: 50} // Chão
        ],
        doors: [
            {x: 20, y: height - 100, width: 30, height: 50, toRoom: 1} // Porta esquerda
        ],
        spirits: [],
        lore: [
            {x: 200, y: height - 150, text: 'O vazio consome.'}
        ],
        puzzles: [],
        darkAreas: []
    }
];

let currentRoom = rooms[0];
let fadeAlpha = 0; // Para transições fade
let transitioning = false;
let targetRoomId = 0;

// Controles
const keys = {};
window.addEventListener('keydown', (e) => { keys[e.key] = true; });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// Controles toque para mobile
let touchStartX = 0;
let touchMoveX = 0;
let isTouchJumping = false;
canvas.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    if (e.touches[0].clientY < height / 2) isTouchJumping = true; // Toque superior pula
});
canvas.addEventListener('touchmove', (e) => {
    touchMoveX = e.touches[0].clientX;
});
canvas.addEventListener('touchend', () => {
    touchMoveX = touchStartX;
    isTouchJumping = false;
});

// Função de colisão
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Atualiza jogador
function updatePlayer() {
    // Movimento horizontal
    let moving = false;
    if (keys['ArrowLeft'] || keys['a'] || keys['A'] || (touchMoveX < touchStartX - 50)) {
        player.x -= player.speed;
        player.facingRight = false;
        moving = true;
    }
    if (keys['ArrowRight'] || keys['d'] || keys['D'] || (touchMoveX > touchStartX + 50)) {
        player.x += player.speed;
        player.facingRight = true;
        moving = true;
    }

    // Pulo
    if ((keys['ArrowUp'] || keys['w'] || keys['W'] || keys[' '] || isTouchJumping) && !player.isJumping) {
        player.velocityY = -player.jumpSpeed;
        player.isJumping = true;
    }

    // Gravidade
    player.velocityY += player.gravity;
    player.y += player.velocityY;

    // Colisão com plataformas
    for (let platform of currentRoom.platforms) {
        if (checkCollision(player, platform) && player.velocityY > 0) {
            player.y = platform.y - player.height;
            player.velocityY = 0;
            player.isJumping = false;
        }
    }

    // Limites da tela
    if (player.x < 0) player.x = 0;
    if (player.x > width - player.width) player.x = width - player.width;
    if (player.y > height - player.height - 50) { // Chão geral
        player.y = height - player.height - 50;
        player.velocityY = 0;
        player.isJumping = false;
    }

    // Interação com portas
    for (let door of currentRoom.doors) {
        if (checkCollision(player, door) && !door.blocked) {
            transitioning = true;
            targetRoomId = door.toRoom;
        }
    }

    // Interação com espíritos bloqueadores (dano se colidir)
    for (let spirit of currentRoom.spirits) {
        if (spirit.type === 'blocker' && spirit.visible && Math.hypot(player.x - spirit.x, player.y - spirit.y) < spirit.radius + 10) {
            player.health--;
            if (player.health <= 0) player.health = 0; // Game over simples (não implementado)
        }
    }

    // Puzzles: Observação na sala 2
    if (currentRoom.id === 1 && currentRoom.puzzles.length > 0) {
        const puzzle = currentRoom.puzzles[0];
        if (!moving && Math.hypot(player.x - puzzle.x, player.y - puzzle.y) < 50) {
            puzzle.timer++;
            if (puzzle.timer >= puzzle.requiredTime) {
                puzzle.revealed = true;
                // Revela símbolo, desbloqueia porta e esconde espírito bloqueador
                currentRoom.doors[1].blocked = false;
                currentRoom.spirits[0].visible = false;
            }
        } else {
            puzzle.timer = 0;
        }
    }
}

// Desenha o jogo
function draw() {
    // Fundo
    ctx.fillStyle = currentRoom.backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // Plataformas (pixel art simples: retângulos cinza)
    ctx.fillStyle = '#555';
    for (let platform of currentRoom.platforms) {
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    }

    // Portas (retângulos vermelhos)
    ctx.fillStyle = '#800';
    for (let door of currentRoom.doors) {
        if (!door.blocked) ctx.fillRect(door.x, door.y, door.width, door.height);
    }

    // Espíritos (círculos brancos fantasmagóricos)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    for (let spirit of currentRoom.spirits) {
        if (spirit.visible) {
            ctx.beginPath();
            ctx.arc(spirit.x, spirit.y, spirit.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Lore (textos brancos curtos)
    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    for (let item of currentRoom.lore) {
        ctx.fillText(item.text, item.x, item.y);
    }

    // Puzzles (símbolo revelado: círculo amarelo)
    for (let puzzle of currentRoom.puzzles) {
        if (puzzle.revealed) {
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(puzzle.x, puzzle.y, puzzle.radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Áreas escuras (overlay preto semi-transparente)
    for (let area of currentRoom.darkAreas) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(area.x, area.y, area.radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Jogador (retângulo azul simples)
    ctx.fillStyle = '#00f';
    ctx.fillRect(player.x, player.y, player.width, player.height);

    // Vida (máscaras: círculos vermelhos no topo)
    ctx.fillStyle = '#f00';
    for (let i = 0; i < player.health; i++) {
        ctx.beginPath();
        ctx.arc(20 + i * 30, 20, 10, 0, Math.PI * 2);
        ctx.fill();
    }

    // Fade transição
    if (transitioning) {
        fadeAlpha += 0.05;
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
        ctx.fillRect(0, 0, width, height);
        if (fadeAlpha >= 1) {
            currentRoom = rooms.find(r => r.id === targetRoomId);
            player.x = targetRoomId > currentRoom.id ? 50 : width - 50; // Reposiciona jogador
            transitioning = false;
            fadeAlpha = 1; // Começa fade out
        }
    } else if (fadeAlpha > 0) {
        fadeAlpha -= 0.05;
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
        ctx.fillRect(0, 0, width, height);
    }
}

// Loop principal
function gameLoop() {
    updatePlayer();
    draw();
    requestAnimationFrame(gameLoop);
}

// Inicia o jogo
startAmbientSound();
gameLoop();
