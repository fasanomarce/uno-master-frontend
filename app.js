// =============================================================================
// 1. CONEXIÓN AL SERVIDOR WEBSOCKET (Apuntando a localhost)
// =============================================================================
const ws = new WebSocket('ws://localhost:3000');

// =============================================================================
// 2. SELECCIÓN DE ELEMENTOS DEL DOM
// =============================================================================
const screens = {
    login: document.getElementById('login-screen'),
    waiting: document.getElementById('waiting-screen'),
    board: document.getElementById('game-board')
};

const loginInput = document.getElementById('username-input');
const btnJoin = document.getElementById('btn-join');
const loginError = document.getElementById('login-error');
const playersList = document.getElementById('players-list');

const txtDirection = document.getElementById('game-direction');
const txtCurrentTurn = document.getElementById('current-turn-name');
const gameLog = document.getElementById('game-log');
const imgTopCard = document.getElementById('top-card-img');
const playerHandContainer = document.getElementById('player-hand');
const deckPile = document.getElementById('deck-pile');

const unoActionsPanel = document.getElementById('uno-actions-panel');
const btnCantarUno = document.getElementById('btn-cantar-uno');
const btnCantarCorte = document.getElementById('btn-cantar-corte');

const colorModal = document.getElementById('color-picker-modal');
const penaltyModal = document.getElementById('penalty-modal');
const penaltyMessage = document.getElementById('penalty-message');
const btnResolvePenalty = document.getElementById('btn-resolve-popup');

let pendingCardIndex = null;

// =============================================================================
// 3. MAPEADOR DE IMÁGENES INTEGRADO Y ROBUSTO (Con barras iniciales "/")
// =============================================================================
function getCardImagePath(card) {
    if (!card) return '/assets/card_back.png';

    const valorStr = String(card.value);
    const colorStr = String(card.color);

    // Comodines
    if (colorStr.includes('Comodín') || valorStr.includes('Color')) {
        return '/assets/Wild_ChangeColor.png';
    }
    if (valorStr.includes('+4')) {
        return '/assets/Wild_DrawFour.png';
    }

    // Colores base
    const colorMap = { 'Rojo': 'Red', 'Amarillo': 'Yellow', 'Verde': 'Green', 'Azul': 'Blue' };
    const colorEnglish = colorMap[card.color] || 'Red';

    // Valores especiales y numéricos (Soporta truncados del backend como 'Sentid' o 'Cambio')
    let valueEnglish = 'Zero';
    if (valorStr.includes('Bloqueo')) valueEnglish = 'SkipTurn';
    else if (valorStr.includes('Sentid') || valorStr.includes('Cambio')) valueEnglish = 'Reverse';
    else if (valorStr.includes('+2')) valueEnglish = 'DrawTwo';
    else {
        const numeros = {
            '0': 'Zero', '1': 'One', '2': 'Two', '3': 'Three', '4': 'Four',
            '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight', '9': 'Nine'
        };
        valueEnglish = numeros[valorStr] || 'Zero';
    }

    return `/assets/${colorEnglish}_${valueEnglish}.png`;
}

// =============================================================================
// 4. GESTIÓN DE VISTAS
// =============================================================================
function showScreen(screenKey) {
    Object.keys(screens).forEach(key => {
        if (key === screenKey) {
            screens[key].classList.remove('hidden');
        } else {
            screens[key].classList.add('hidden');
        }
    });
}

// =============================================================================
// 5. RECEPCIÓN DE MENSAJES (SERVIDOR -> FRONTEND)
// =============================================================================
ws.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);

    switch (type) {
        case 'waitingRoom':
            showScreen('waiting');
            playersList.innerHTML = data.map(name => `<li>${name} (Listo)</li>`).join('');
            break;

        case 'gameState':
            showScreen('board');
            txtDirection.textContent = data.direction;
            txtCurrentTurn.textContent = data.isMyTurn ? '¡TU TURNO! ✨' : data.currentTurnName;
            
            if (data.log) {
                gameLog.innerHTML = `<p class="log-entry">${data.log}</p>`;
            }

            imgTopCard.src = getCardImagePath(data.topCard);

            if (data.mostrarBotoneraUno) {
                unoActionsPanel.classList.remove('hidden');
            } else {
                unoActionsPanel.classList.add('hidden');
            }

            playerHandContainer.innerHTML = '';
            data.hand.forEach((card, index) => {
                const img = document.createElement('img');
                img.src = getCardImagePath(card);
                img.alt = `${card.color} ${card.value}`;
                
                if (data.isMyTurn && !data.isPaused) {
                    img.classList.add('clickable');
                    img.addEventListener('click', () => intentarJugarCarta(card, index));
                }
                playerHandContainer.appendChild(img);
            });
            break;

        case 'showPopup':
            penaltyMessage.textContent = data;
            penaltyModal.classList.remove('hidden');
            break;

        case 'errorMsg':
            loginError.textContent = data;
            loginError.classList.remove('hidden');
            break;

        case 'gameOver':
            alert(data);
            location.reload();
            break;
    }
};

// =============================================================================
// 6. ACCIONES HACIA EL SERVIDOR (FRONTEND -> SERVIDOR)
// =============================================================================
btnJoin.addEventListener('click', () => {
    const username = loginInput.value.trim();
    if (username) {
        ws.send(JSON.stringify({ type: 'joinGame', data: username }));
    } else {
        loginError.textContent = "Por favor ingresa un nombre válido.";
        loginError.classList.remove('hidden');
    }
});

loginInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnJoin.click();
});

deckPile.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'drawCard' }));
});

btnCantarUno.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'cantarUno' }));
});

btnCantarCorte.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'cantarCorte' }));
});

btnResolvePenalty.addEventListener('click', () => {
    penaltyModal.classList.add('hidden');
    ws.send(JSON.stringify({ type: 'resolvePopup' }));
});

function intentarJugarCarta(card, index) {
    if (card.color === 'Comodín' || String(card.value).includes('Color') || String(card.value).includes('+4')) {
        pendingCardIndex = index;
        colorModal.classList.remove('hidden');
    } else {
        ws.send(JSON.stringify({ 
            type: 'playCard', 
            data: { index: index, chosenColor: null } 
        }));
    }
}

document.querySelectorAll('.color-btn').forEach(button => {
    button.addEventListener('click', () => {
        const colorSeleccionado = button.getAttribute('data-color');
        colorModal.classList.add('hidden');
        
        if (pendingCardIndex !== null) {
            ws.send(JSON.stringify({
                type: 'playCard',
                data: { index: pendingCardIndex, chosenColor: colorSeleccionado }
            }));
            pendingCardIndex = null;
        }
    });
});