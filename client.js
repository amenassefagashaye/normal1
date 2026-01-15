// WebSocket Client for Multiplayer Bingo Game
class BingoClient {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.gameState = {
            id: null,
            type: '75ball',
            status: 'waiting', // waiting, running, finished
            stake: 25,
            players: [],
            currentNumber: null,
            calledNumbers: [],
            winners: [],
            autoCall: false,
            callInterval: 7000
        };
        this.playerInfo = {
            name: '',
            phone: '',
            stake: 25,
            boardId: 1,
            boardNumbers: [],
            status: 'waiting', // waiting, ready, playing, won, lost
            balance: 0,
            markedNumbers: new Set(),
            boardElement: null,
            autoMark: true
        };
        this.audioEnabled = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // Initialize WebSocket connection
    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.updateConnectionStatus();
        this.setupBoardSelection();
        this.setupBoardNumbers();
        
        // Check for existing player data
        this.loadPlayerData();
        
        // Update online status every 30 seconds
        setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    // Connect to WebSocket server
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = window.location.hostname === 'localhost' 
            ? 'ws://localhost:8080/ws'
            : `${protocol}//${window.location.hostname}/ws`;
        
        console.log('Connecting to:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            
            // Send player info if exists
            if (this.playerInfo.name) {
                this.sendPlayerInfo();
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateConnectionStatus(false);
            this.attemptReconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    // Handle server messages
    handleServerMessage(data) {
        console.log('Server message:', data.type);
        
        switch(data.type) {
            case 'welcome':
                this.playerId = data.playerId;
                break;
                
            case 'game_state':
                this.updateGameState(data.state);
                break;
                
            case 'player_list':
                this.updatePlayerList(data.players);
                break;
                
            case 'number_called':
                this.handleNumberCalled(data.number, data.letter);
                break;
                
            case 'player_joined':
                this.showNotification(`${data.playerName} ጨዋታ ገብቷል`);
                this.updatePlayerList(data.players);
                break;
                
            case 'player_left':
                this.showNotification(`${data.playerName} ጨዋታ ለቃል`);
                this.updatePlayerList(data.players);
                break;
                
            case 'player_ready':
                this.showNotification(`${data.playerName} ዝግጁ ነው`);
                this.updatePlayerList(data.players);
                break;
                
            case 'game_started':
                this.handleGameStarted(data.game);
                break;
                
            case 'game_stopped':
                this.handleGameStopped();
                break;
                
            case 'winner':
                this.handleWinner(data.winner);
                break;
                
            case 'chat_message':
                this.addChatMessage(data.message);
                break;
                
            case 'announcement':
                this.showAnnouncement(data.message);
                break;
                
            case 'error':
                this.showNotification(data.message, true);
                break;
                
            case 'ping':
                // Respond to ping
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ type: 'pong' }));
                }
                break;
        }
    }

    // Update game state
    updateGameState(state) {
        this.gameState = { ...this.gameState, ...state };
        
        // Update UI
        this.updateGameUI();
        
        // If game is running and we're in lobby, move to game board
        if (state.status === 'running' && this.getCurrentPage() === 3) {
            if (this.playerInfo.status === 'ready' || this.playerInfo.status === 'playing') {
                this.showPage(4);
                this.generateGameBoard();
            }
        }
    }

    // Update player list
    updatePlayerList(players) {
        this.gameState.players = players;
        
        // Update lobby display
        if (this.getCurrentPage() === 3) {
            this.updateLobbyPlayers(players);
        }
        
        // Update player count
        document.getElementById('playersCount').textContent = players.length;
        document.getElementById('currentPlayers').textContent = players.length;
    }

    // Handle number called
    handleNumberCalled(number, letter) {
        const displayNumber = letter ? `${letter}-${number}` : number.toString();
        
        // Update current number display
        if (this.getCurrentPage() === 4) {
            document.getElementById('currentNumberDisplay').textContent = displayNumber;
            
            // Add to called numbers grid
            this.addCalledNumber(displayNumber);
            
            // Update count
            const calledCount = document.getElementById('calledCount');
            calledCount.textContent = parseInt(calledCount.textContent) + 1;
            
            // Auto-mark if enabled
            if (this.playerInfo.autoMark) {
                this.autoMarkNumber(number);
            }
        }
        
        // Play sound
        if (this.audioEnabled) {
            this.playSound('call');
        }
        
        // Show notification for new number
        if (this.getCurrentPage() !== 4) {
            this.showNotification(`አዲስ ቁጥር: ${displayNumber}`);
        }
    }

    // Handle game started
    handleGameStarted(game) {
        this.gameState = game;
        this.showNotification('ጨዋታ ጀመረ!');
        
        // Generate board for player
        if (this.playerInfo.status === 'ready') {
            this.playerInfo.status = 'playing';
            this.playerInfo.boardNumbers = this.generateBoardNumbers(game.type);
            this.showPage(4);
            this.generateGameBoard();
        }
    }

    // Handle game stopped
    handleGameStopped() {
        this.gameState.status = 'finished';
        this.showNotification('ጨዋታ አልቋል!');
        
        if (this.getCurrentPage() === 4) {
            this.showPage(3);
        }
    }

    // Handle winner
    handleWinner(winner) {
        // Play win sound
        if (this.audioEnabled) {
            this.playSound('win');
        }
        
        // Show winner notification
        if (winner.playerId === this.playerId) {
            this.showWinnerNotification('እርስዎ!', winner.pattern, winner.amount);
            this.playerInfo.balance += winner.amount;
            this.playerInfo.status = 'won';
        } else {
            this.showNotification(`${winner.playerName} አሸነፈ!`);
        }
        
        // Update game state
        this.gameState.winners.push(winner);
    }

    // Send player info to server
    sendPlayerInfo() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'player_info',
                playerId: this.playerId,
                name: this.playerInfo.name,
                phone: this.playerInfo.phone,
                stake: this.playerInfo.stake,
                boardId: this.playerInfo.boardId
            }));
        }
    }

    // Join game
    joinGame() {
        const name = document.getElementById('playerName').value.trim();
        const phone = document.getElementById('playerPhone').value.trim();
        const stake = parseInt(document.getElementById('playerStake').value);
        const boardId = document.getElementById('boardSelect').value;
        
        if (!name || !phone) {
            this.showNotification('እባክዎ ስም እና ስልክ ያስገቡ', true);
            return;
        }
        
        if (phone.length < 10) {
            this.showNotification('ትክክለኛ ስልክ ያስገቡ', true);
            return;
        }
        
        // Save player info
        this.playerInfo = {
            ...this.playerInfo,
            name: name,
            phone: phone,
            stake: stake,
            boardId: boardId,
            status: 'waiting',
            balance: 0
        };
        
        // Save to localStorage
        this.savePlayerData();
        
        // Send to server
        this.sendPlayerInfo();
        
        // Move to lobby
        this.showPage(3);
        
        // Update lobby info
        this.updateLobbyInfo();
    }

    // Toggle ready status
    toggleReady() {
        if (!this.playerId) return;
        
        const newStatus = this.playerInfo.status === 'ready' ? 'waiting' : 'ready';
        this.playerInfo.status = newStatus;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'player_ready',
                playerId: this.playerId,
                status: newStatus
            }));
        }
        
        // Update button text
        const btn = document.getElementById('readyBtn');
        btn.textContent = newStatus === 'ready' ? 'እየጠበቅኩ ነው' : 'ዝግጁ ነኝ';
        btn.classList.toggle('btn-success', newStatus === 'ready');
        btn.classList.toggle('btn-info', newStatus !== 'ready');
    }

    // Leave game
    leaveGame() {
        if (confirm('ከጨዋታ ለመውጣት እርግጠኛ ነዎት?')) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'player_leave',
                    playerId: this.playerId
                }));
            }
            
            this.playerInfo.status = 'waiting';
            this.showPage(0);
        }
    }

    // Claim bingo
    claimBingo() {
        if (!this.playerId || this.playerInfo.status !== 'playing') return;
        
        // Check if player has a valid bingo
        const winPattern = this.checkWinPattern();
        
        if (winPattern) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'claim_bingo',
                    playerId: this.playerId,
                    pattern: winPattern,
                    markedNumbers: Array.from(this.playerInfo.markedNumbers)
                }));
            }
            
            // Disable bingo button
            document.getElementById('bingoBtn').disabled = true;
        } else {
            this.showNotification('የማሸነፍ ንድፍ አላጠናቀቁም!', true);
        }
    }

    // Check win pattern
    checkWinPattern() {
        const gameType = this.gameState.type;
        const marked = this.playerInfo.markedNumbers;
        const board = this.playerInfo.boardElement;
        
        // Implement pattern checking based on game type
        // This is simplified - implement full pattern checking
        if (gameType === '75ball') {
            // Check rows
            for (let i = 0; i < 5; i++) {
                let rowComplete = true;
                for (let j = 0; j < 5; j++) {
                    if (i === 2 && j === 2) continue; // Free space
                    const cell = board.querySelector(`[data-row="${i}"][data-col="${j}"]`);
                    if (cell && !cell.classList.contains('marked')) {
                        rowComplete = false;
                        break;
                    }
                }
                if (rowComplete) return 'row';
            }
            
            // Check columns
            for (let j = 0; j < 5; j++) {
                let colComplete = true;
                for (let i = 0; i < 5; i++) {
                    if (i === 2 && j === 2) continue; // Free space
                    const cell = board.querySelector(`[data-row="${i}"][data-col="${j}"]`);
                    if (cell && !cell.classList.contains('marked')) {
                        colComplete = false;
                        break;
                    }
                }
                if (colComplete) return 'column';
            }
        }
        
        return null;
    }

    // Generate board numbers
    generateBoardNumbers(gameType) {
        // Implement board number generation based on game type
        // This is simplified - implement full generation
        const numbers = [];
        const range = gameType === '75ball' ? 75 : 
                     gameType === '90ball' ? 90 :
                     gameType === '30ball' ? 30 :
                     gameType === '50ball' ? 50 : 75;
        
        // Generate unique numbers
        while (numbers.length < 24) { // 5x5 minus center
            const num = Math.floor(Math.random() * range) + 1;
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
        }
        
        return numbers;
    }

    // Generate game board UI
    generateGameBoard() {
        const container = document.getElementById('gameBoard');
        container.innerHTML = '';
        
        const gameType = this.gameState.type;
        
        if (gameType === '75ball') {
            this.generate75BallBoard(container);
        }
        // Add other game types...
    }

    generate75BallBoard(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'board-75-wrapper';
        
        // BINGO labels
        const labels = document.createElement('div');
        labels.className = 'bingo-labels';
        'BINGO'.split('').forEach(letter => {
            const label = document.createElement('div');
            label.className = 'bingo-label';
            label.textContent = letter;
            labels.appendChild(label);
        });
        wrapper.appendChild(labels);
        
        // Board grid
        const grid = document.createElement('div');
        grid.className = 'board-75';
        
        // Generate numbers for each column
        const columnRanges = [
            [1, 15], [16, 30], [31, 45], [46, 60], [61, 75]
        ];
        
        const columnNumbers = columnRanges.map(range => {
            let nums = new Set();
            while (nums.size < 5) {
                nums.add(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
            }
            return Array.from(nums).sort((a, b) => a - b);
        });
        
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const cell = document.createElement('button');
                cell.className = 'board-cell';
                cell.dataset.row = row;
                cell.dataset.col = col;
                
                if (row === 2 && col === 2) {
                    // Center free space
                    cell.textContent = '★';
                    cell.classList.add('center-cell');
                    cell.classList.add('marked'); // Free space is always marked
                } else {
                    const num = columnNumbers[col][row];
                    cell.textContent = num;
                    cell.dataset.number = num;
                    
                    cell.onclick = () => {
                        this.toggleNumberMark(num, cell);
                    };
                }
                
                grid.appendChild(cell);
            }
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.playerInfo.boardElement = grid;
    }

    // Toggle number mark
    toggleNumberMark(number, cell) {
        if (this.playerInfo.status !== 'playing') return;
        
        if (cell.classList.contains('marked')) {
            cell.classList.remove('marked');
            this.playerInfo.markedNumbers.delete(number);
        } else {
            cell.classList.add('marked');
            this.playerInfo.markedNumbers.add(number);
        }
        
        // Update marked count
        const markedCount = document.getElementById('markedCount');
        markedCount.textContent = this.playerInfo.markedNumbers.size;
        
        // Check if bingo is possible
        this.checkBingoButton();
    }

    // Auto-mark number
    autoMarkNumber(number) {
        if (!this.playerInfo.boardElement) return;
        
        const cell = this.playerInfo.boardElement.querySelector(`[data-number="${number}"]`);
        if (cell && !cell.classList.contains('marked')) {
            cell.classList.add('marked');
            this.playerInfo.markedNumbers.add(number);
            
            // Update marked count
            const markedCount = document.getElementById('markedCount');
            markedCount.textContent = this.playerInfo.markedNumbers.size;
            
            // Check bingo
            this.checkBingoButton();
        }
    }

    // Check bingo button state
    checkBingoButton() {
        const btn = document.getElementById('bingoBtn');
        const hasBingo = this.checkWinPattern();
        btn.disabled = !hasBingo;
    }

    // Add called number to display
    addCalledNumber(number) {
        const grid = document.getElementById('calledNumbersGrid');
        const item = document.createElement('div');
        item.className = 'called-number-item new';
        item.textContent = number;
        grid.prepend(item);
        
        // Limit displayed numbers
        while (grid.children.length > 30) {
            grid.removeChild(grid.lastChild);
        }
        
        // Remove new class after animation
        setTimeout(() => {
            item.classList.remove('new');
        }, 1000);
    }

    // Add chat message
    addChatMessage(message) {
        if (this.getCurrentPage() === 3) {
            const container = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.innerHTML = `
                <span class="sender">${message.sender}:</span>
                <span class="text">${message.text}</span>
                <span class="time">${this.formatTime(message.timestamp)}</span>
            `;
            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
        }
    }

    // Send chat message
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'chat_message',
                playerId: this.playerId,
                message: message
            }));
            input.value = '';
        }
    }

    // Show notification
    showNotification(message, isError = false) {
        const notification = document.getElementById('globalNotification');
        const content = document.getElementById('notificationContent');
        
        content.textContent = message;
        content.style.color = isError ? '#dc3545' : '#ffd700';
        
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 3000);
    }

    // Show announcement
    showAnnouncement(message) {
        const notification = document.getElementById('globalNotification');
        const content = document.getElementById('notificationContent');
        
        content.innerHTML = `<span style="color:#28a745">📢 ማሳወቂያ:</span> ${message}`;
        notification.style.display = 'block';
        
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);
    }

    // Show winner notification
    showWinnerNotification(winner, pattern, amount) {
        document.getElementById('winnerName').textContent = winner;
        document.getElementById('winPattern').textContent = pattern;
        document.getElementById('winAmount').textContent = `${amount.toLocaleString()} ብር`;
        document.getElementById('winnerNotification').style.display = 'block';
    }

    // Update connection status
    updateConnectionStatus(connected = false) {
        const statusText = document.getElementById('statusText');
        const serverStatus = document.getElementById('serverStatus');
        
        if (connected) {
            statusText.textContent = 'Connected';
            statusText.className = 'connected';
            serverStatus.textContent = '● Connected';
            serverStatus.className = 'status-connected';
        } else {
            statusText.textContent = 'Disconnected';
            statusText.className = 'disconnected';
            serverStatus.textContent = '● Disconnected';
            serverStatus.className = 'status-disconnected';
        }
    }

    // Attempt reconnect
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
            
            this.showNotification(`ተገናኝተው እያለ ነው... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            this.showNotification('የማገናኘት ሙከራ አልተሳካም። እባክዎ እንደገና ይሞክሩ።', true);
        }
    }

    // Play sound
    playSound(type) {
        if (!this.audioEnabled) return;
        
        const audio = document.getElementById(`${type}Audio`);
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Audio play failed:', e));
        }
    }

    // Toggle audio
    toggleAudio() {
        this.audioEnabled = !this.audioEnabled;
        const btn = document.querySelector('[onclick="toggleAudio()"]');
        btn.textContent = this.audioEnabled ? '🔊' : '🔇';
    }

    // Format time
    formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Save player data
    savePlayerData() {
        localStorage.setItem('bingo_player', JSON.stringify(this.playerInfo));
    }

    // Load player data
    loadPlayerData() {
        const saved = localStorage.getItem('bingo_player');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.playerInfo = { ...this.playerInfo, ...data };
                
                // Fill form fields
                document.getElementById('playerName').value = this.playerInfo.name;
                document.getElementById('playerPhone').value = this.playerInfo.phone;
                document.getElementById('playerStake').value = this.playerInfo.stake;
            } catch (e) {
                console.log('Could not load saved player data');
            }
        }
    }

    // Setup board selection
    setupBoardSelection() {
        const grid = document.getElementById('boardTypeGrid');
        const boardTypes = [
            { id: '75ball', name: '75-ቢንጎ', icon: '🎯', desc: '5×5 ከBINGO' },
            { id: '90ball', name: '90-ቢንጎ', icon: '🇬🇧', desc: '9×3 ፈጣን' },
            { id: '30ball', name: '30-ቢንጎ', icon: '⚡', desc: '3×3 ፍጥነት' },
            { id: '50ball', name: '50-ቢንጎ', icon: '🎲', desc: '5×5 ከBINGO' },
            { id: 'pattern', name: 'ንድፍ ቢንጎ', icon: '✨', desc: 'ተጠቀም ንድፍ' },
            { id: 'coverall', name: 'ሙሉ ቤት', icon: '🏆', desc: 'ሁሉንም ምልክት ያድርጉ' }
        ];
        
        grid.innerHTML = '';
        boardTypes.forEach(type => {
            const card = document.createElement('div');
            card.className = 'board-type-card';
            card.innerHTML = `
                <div class="board-type-icon">${type.icon}</div>
                <div class="board-type-title amharic-text">${type.name}</div>
                <div class="board-type-desc amharic-text">${type.desc}</div>
            `;
            card.onclick = () => {
                document.querySelectorAll('.board-type-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.gameState.type = type.id;
            };
            grid.appendChild(card);
        });
    }

    // Setup board numbers
    setupBoardNumbers() {
        const select = document.getElementById('boardSelect');
        select.innerHTML = '';
        for (let i = 1; i <= 100; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `ቦርድ ${i}`;
            select.appendChild(option);
        }
    }

    // Update lobby info
    updateLobbyInfo() {
        document.getElementById('lobbyGameType').textContent = 
            this.gameState.type === '75ball' ? '75-ቢንጎ' :
            this.gameState.type === '90ball' ? '90-ቢንጎ' :
            this.gameState.type === '30ball' ? '30-ቢንጎ' :
            this.gameState.type === '50ball' ? '50-ቢንጎ' :
            this.gameState.type === 'pattern' ? 'ንድፍ ቢንጎ' : 'ሙሉ ቤት';
        
        document.getElementById('lobbyStake').textContent = `${this.gameState.stake} ብር`;
        
        // Calculate potential prize
        const prize = Math.floor(this.gameState.players.length * this.gameState.stake * 0.8);
        document.getElementById('lobbyPrize').textContent = `${prize.toLocaleString()} ብር`;
    }

    // Update lobby players
    updateLobbyPlayers(players) {
        const container = document.getElementById('playersList');
        container.innerHTML = '';
        
        players.forEach(player => {
            const item = document.createElement('div');
            item.className = 'player-item';
            item.innerHTML = `
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-phone">${player.phone}</div>
                </div>
                <div class="player-details">
                    <div class="player-stake">${player.stake} ብር</div>
                    <div class="player-status ${player.status}">${player.status}</div>
                </div>
            `;
            container.appendChild(item);
        });
    }

    // Get current page
    getCurrentPage() {
        const pages = document.querySelectorAll('.page-container');
        for (let i = 0; i < pages.length; i++) {
            if (pages[i].classList.contains('active')) {
                return i;
            }
        }
        return 0;
    }

    // Show page
    showPage(pageNum) {
        document.querySelectorAll('.page-container').forEach(page => {
            page.classList.remove('active');
        });
        document.getElementById(`page${pageNum}`).classList.add('active');
    }

    // Setup event listeners
    setupEventListeners() {
        // Player stake change
        document.getElementById('playerStake').addEventListener('change', (e) => {
            const stake = parseInt(e.target.value);
            document.getElementById('stakeAmount').textContent = `${stake} ብር`;
            
            // Update potential win
            const potential = Math.floor(90 * stake * 0.8);
            document.getElementById('potentialWin').textContent = `${potential.toLocaleString()} ብር`;
        });
        
        // Chat input enter key
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Auto-mark toggle
        document.getElementById('autoMarkText')?.addEventListener('click', () => {
            this.playerInfo.autoMark = !this.playerInfo.autoMark;
            const btn = document.querySelector('[onclick="autoMarkToggle()"]');
            btn.querySelector('span').textContent = 
                this.playerInfo.autoMark ? 'ራስ-ሰር ምልክት' : 'እጅ በእጅ ምልክት';
        });
    }
}

// Initialize client when page loads
let bingoClient;

window.addEventListener('DOMContentLoaded', () => {
    bingoClient = new BingoClient();
    bingoClient.init();
});

// Global functions for HTML onclick handlers
function showPage(pageNum) {
    bingoClient.showPage(pageNum);
}

function joinGame() {
    bingoClient.joinGame();
}

function toggleReady() {
    bingoClient.toggleReady();
}

function leaveGame() {
    bingoClient.leaveGame();
}

function claimBingo() {
    bingoClient.claimBingo();
}

function sendChatMessage() {
    bingoClient.sendChatMessage();
}

function toggleAudio() {
    bingoClient.toggleAudio();
}

function autoMarkToggle() {
    bingoClient.playerInfo.autoMark = !bingoClient.playerInfo.autoMark;
    const btn = document.querySelector('[onclick="autoMarkToggle()"]');
    btn.querySelector('span').textContent = 
        bingoClient.playerInfo.autoMark ? 'ራስ-ሰር ምልክት' : 'እጅ በእጅ ምልክት';
}

function showHelp() {
    showPage(5);
}

function continueWatching() {
    document.getElementById('winnerNotification').style.display = 'none';
}

function leaveGameBoard() {
    if (confirm('ከጨዋታ ለመውጣት እርግጠኛ ነዎት?')) {
        bingoClient.leaveGame();
        showPage(0);
    }
}