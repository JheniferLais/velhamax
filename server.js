const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permite que qualquer front-end conecte
        methods: ["GET", "POST"]
    }
});

// Armazena as salas na memória do servidor
const rooms = new Map();

function defaultGameState() {
    return {
        boards: Array.from({ length: 9 }, () => Array(9).fill(null)),
        boardWinner: Array(9).fill(null),
        currentPlayer: 'X',
        activeBoard: null,
        gameOver: false,
        winner: null,
    };
}

io.on('connection', (socket) => {
    console.log(`[+] Conectado: ${socket.id}`);

    // Criar sala
    socket.on('create_room', () => {
        const roomId = 'velha-' + Math.random().toString(36).substring(2, 8);

        rooms.set(roomId, {
            players: { X: socket.id, O: null },
            gameState: defaultGameState()
        });

        socket.join(roomId);
        socket.emit('room_created', { roomId, role: 'X' });
        console.log(`[Sala Criada] ID: ${roomId}`);
    });

    // Entrar em sala existente
    socket.on('join_room', (roomId) => {
        const room = rooms.get(roomId);

        if (!room) {
            socket.emit('error_message', 'Sala não encontrada!');
            return;
        }

        if (room.players.O) {
            socket.emit('error_message', 'Esta sala já está cheia!');
            return;
        }

        room.players.O = socket.id;
        socket.join(roomId);

        socket.emit('room_joined', { roomId, role: 'O' });

        // Notifica ambos que a partida começou!
        io.to(roomId).emit('start_game', {
            gameState: room.gameState,
            players: room.players
        });

        console.log(`[Jogador Entrou] Sala: ${roomId}`);
    });

    // Sincronizar Jogada
    socket.on('make_move', ({ roomId, gameState }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.gameState = gameState;
            // Transmite o novo estado para o outro jogador
            socket.to(roomId).emit('update_game_state', gameState);
        }
    });

    // Reiniciar Partida
    socket.on('reset_game', (roomId) => {
        const room = rooms.get(roomId);
        if (room) {
            room.gameState = defaultGameState();
            io.to(roomId).emit('update_game_state', room.gameState);
        }
    });

    // Desconexão
    socket.on('disconnect', () => {
        console.log(`[-] Desconectado: ${socket.id}`);
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.X === socket.id || room.players.O === socket.id) {
                io.to(roomId).emit('player_left');
                rooms.delete(roomId);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});