(function(){
    const LINES = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];

    const BACKEND_URL = "https://velhamax.onrender.com";

    const splash = document.getElementById('splash');
    const splashSub = document.getElementById('splashSub');

    const barDot = document.getElementById('barDot');
    const barLabel = document.getElementById('barLabel');

    const lobbyCard = document.getElementById('lobbyCard');
    const createStage = document.getElementById('createStage');
    const waitStage = document.getElementById('waitStage');
    const createRoomBtn = document.getElementById('createRoomBtn');

    const shareLinkInput = document.getElementById('shareLink');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const copyMsg = document.getElementById('copyMsg');

    const gameArea = document.getElementById('gameArea');
    const turnChip = document.getElementById('turnChip');
    const statusMsg = document.getElementById('statusMsg');
    const megaBoardEl = document.getElementById('megaBoard');
    const endPanel = document.getElementById('endPanel');
    const endTitle = document.getElementById('endTitle');
    const rematchBtn = document.getElementById('rematchBtn');
    const mascotEl = document.getElementById('mascot');

    let socket = null;
    let currentRoomId = null;
    let myRole = null;
    let state = null;

    // ---------- Mascote: pixel-art de um X 5x5 ----------
    (function buildMascot(){
        const onCells = new Set([0,4,6,8,12,16,18,20,24]);
        for(let i = 0; i < 25; i++){
            const px = document.createElement('i');
            if(onCells.has(i)) px.className = 'on';
            mascotEl.appendChild(px);
        }
    })();

    // ---------- Telas ----------
    function showScreen(name){
        lobbyCard.hidden = name !== 'lobby' && name !== 'waiting';
        gameArea.hidden = name !== 'game';

        if (name === 'lobby') {
            createStage.classList.remove('hidden');
            waitStage.classList.add('hidden');
        } else if (name === 'waiting') {
            createStage.classList.add('hidden');
            waitStage.classList.remove('hidden');
        }
    }

    function hideSplash(){
        if (splash.hidden) return;
        splash.classList.add('fade-out');
        setTimeout(() => splash.hidden = true, 400);
    }

    // ---------- Rede ----------
    function initNetwork() {
        socket = io(BACKEND_URL);

        const slowTimer = setTimeout(() => {
            splashSub.textContent = 'ainda conectando, aguarde';
        }, 4000);

        socket.on('connect', () => {
            clearTimeout(slowTimer);
            barDot.classList.remove('connecting');
            barDot.classList.add('online');
            barLabel.textContent = 'velha-max — conectado';

            const urlParams = new URLSearchParams(window.location.search);
            const roomIdFromUrl = urlParams.get('room');

            if (roomIdFromUrl) {
                splashSub.textContent = 'entrando na partida';
                socket.emit('join_room', roomIdFromUrl);
            } else {
                hideSplash();
                showScreen('lobby');
            }
        });

        barDot.classList.add('connecting');

        socket.on('room_created', ({ roomId, role }) => {
            currentRoomId = roomId;
            myRole = role;

            const fullUrl = window.location.origin + window.location.pathname + '?room=' + roomId;
            shareLinkInput.value = fullUrl;
            barLabel.textContent = 'sala: ' + roomId;
            showScreen('waiting');
        });

        socket.on('room_joined', ({ roomId, role }) => {
            currentRoomId = roomId;
            myRole = role;
            barLabel.textContent = 'sala: ' + roomId;
        });

        socket.on('start_game', ({ gameState }) => {
            state = gameState;
            endPanel.classList.add('hidden');
            hideSplash();
            showScreen('game');
            render();
        });

        socket.on('update_game_state', (newState) => {
            state = newState;
            render();
        });

        socket.on('error_message', (msg) => {
            hideSplash();
            alert(msg);
            window.location.href = window.location.pathname;
        });

        socket.on('player_left', () => {
            hideSplash();
            alert('O outro jogador saiu da partida.');
            window.location.href = window.location.pathname;
        });
    }

    createRoomBtn.addEventListener('click', () => {
        createRoomBtn.disabled = true;
        socket.emit('create_room');
    });

    copyLinkBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(shareLinkInput.value);
        } catch (e) {
            shareLinkInput.select();
            document.execCommand('copy');
        }
        copyMsg.classList.remove('hidden');
        setTimeout(() => copyMsg.classList.add('hidden'), 2000);
    });

    // Revanche: reseta o tabuleiro na MESMA sala, sem precisar reenviar link.
    // Qualquer um dos dois jogadores pode iniciar; o servidor sincroniza os dois.
    rematchBtn.addEventListener('click', () => {
        rematchBtn.disabled = true;
        socket.emit('reset_game', currentRoomId);
    });

    function checkWinner(cells){
        for(const [a,b,c] of LINES){
            if(cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) return cells[a];
        }
        if(cells.every(c => c !== null)) return 'D';
        return null;
    }

    function isBoardOpen(idx){ return state.boardWinner[idx] === null; }
    function anyOpenBoard(){ return state.boardWinner.some(w => w === null); }

    function handleCellClick(boardIdx, cellIdx){
        if(state.gameOver) return;
        if(myRole !== state.currentPlayer) return;
        if(state.boardWinner[boardIdx] !== null) return;
        if(state.boards[boardIdx][cellIdx] !== null) return;
        if(state.activeBoard !== null && state.activeBoard !== boardIdx) return;

        const mover = state.currentPlayer;
        state.boards[boardIdx][cellIdx] = mover;

        state.lastMove = { board: boardIdx, cell: cellIdx };

        const result = checkWinner(state.boards[boardIdx]);
        if(result) state.boardWinner[boardIdx] = result;

        const megaResult = checkWinner(state.boardWinner.map(w => w === 'D' ? null : w));

        if(megaResult && megaResult !== 'D'){
            state.gameOver = true;
            state.winner = megaResult;
        } else if(megaResult === 'D' || !anyOpenBoard()){
            state.gameOver = true;
            state.winner = 'D';
        } else {
            state.currentPlayer = mover === 'X' ? 'O' : 'X';
            state.activeBoard = isBoardOpen(cellIdx) ? cellIdx : null;
        }

        render();

        // Envia o movimento para o servidor
        socket.emit('make_move', { roomId: currentRoomId, gameState: state });
    }

    function render(){
        const last = state.lastMove || null;

        if(state.gameOver){
            rematchBtn.disabled = false;
            if(state.winner === 'D'){
                turnChip.style.display = 'none';
                statusMsg.textContent = 'Empate geral';
                endTitle.textContent = 'Empate geral — ninguém venceu';
            } else {
                turnChip.style.display = '';
                turnChip.className = 'turn-chip ' + state.winner.toLowerCase();
                turnChip.textContent = state.winner;
                statusMsg.textContent = state.winner === myRole ? 'Você venceu!' : `${state.winner} venceu!`;
                endTitle.textContent = state.winner === myRole
                    ? 'Você venceu o jogo'
                    : `${state.winner} venceu o jogo`;
            }
            endPanel.classList.remove('hidden');
        } else {
            turnChip.style.display = '';
            turnChip.className = 'turn-chip ' + state.currentPlayer.toLowerCase();
            turnChip.textContent = state.currentPlayer;
            const isMyTurn = myRole === state.currentPlayer;
            if(isMyTurn){
                statusMsg.textContent = state.activeBoard === null
                    ? 'sua vez — jogue em qualquer quadrante'
                    : `sua vez — jogue no quadrante ${state.activeBoard + 1}`;
            } else {
                statusMsg.textContent = `aguardando a jogada de ${state.currentPlayer}...`;
            }
            endPanel.classList.add('hidden');
        }

        megaBoardEl.innerHTML = '';
        for(let b = 0; b < 9; b++){
            const miniEl = document.createElement('div');
            miniEl.className = 'mini-board';

            const won = state.boardWinner[b];
            if(!state.gameOver && won === null && (state.activeBoard === null || state.activeBoard === b)){
                miniEl.classList.add('active');
            }

            for(let c = 0; c < 9; c++){
                const val = state.boards[b][c];
                const cellEl = document.createElement('button');
                let cls = 'cell' + (val ? ' ' + val.toLowerCase() : '');
                if(last && last.board === b && last.cell === c) cls += ' last-move';
                cellEl.className = cls;
                cellEl.textContent = val || '';

                const notMyTurn = myRole !== state.currentPlayer;
                const disabled = state.gameOver || won !== null || val !== null ||
                    (state.activeBoard !== null && state.activeBoard !== b) || notMyTurn;
                cellEl.disabled = disabled;

                cellEl.addEventListener('click', () => handleCellClick(b, c));
                miniEl.appendChild(cellEl);
            }

            if(won === 'X' || won === 'O'){
                const overlay = document.createElement('div');
                overlay.className = 'mini-overlay ' + won.toLowerCase();
                overlay.textContent = won;
                miniEl.appendChild(overlay);
            } else if(won === 'D'){
                const overlay = document.createElement('div');
                overlay.className = 'mini-overlay d';
                overlay.textContent = 'empate';
                miniEl.appendChild(overlay);
            }

            megaBoardEl.appendChild(miniEl);
        }
    }

    initNetwork();
})();