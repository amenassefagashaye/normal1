// WebSocket Client for Multiplayer Bingo Game
class BingoMultiplayerClient {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.sessionId = null;
        this.gameState = {
            id: null,
            type: '75ball',
            status: 'waiting',
            stake: 25,
            players: [],
            currentNumber: null,
            calledNumbers: [],
            winners: [],
            maxPlayers: 90,
            autoCall: true,
            callInterval: 7000,
            pattern: null
        };
        this.playerInfo = {
            name: '',
            phone: '',
            stake: 25,
            boardId: 1,
            boardNumbers: [],
            status: 'waiting',
            balance: 0,
            markedNumbers: new Set(),
            boardElement: null,
            autoMark: true,
            isReady: false,
            isAdmin: false
        };
        this.audioEnabled = true;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.calledNumbersDisplay = [];
        this.chatMessages = [];
        
        // Board types configuration
        this.boardTypes = [
            { id: '75ball', name: '75-ቢንጎ', icon: '🎯', desc: '5×5 ከBINGO', range: 75, columns: 5 },
            { id: '90ball', name: '90-ቢንጎ', icon: '🇬🇧', desc: '9×3 ፈጣን', range: 90, columns: 9 },
            { id: '30ball', name: '30-ቢንጎ', icon: '⚡', desc: '3×3 ፍጥነት', range: 30, columns: 3 },
            { id: '50ball', name: '50-ቢንጎ', icon: '🎲', desc: '5×5 ከBINGO', range: 50, columns: 5 },
            { id: 'pattern', name: 'ንድፍ ቢንጎ', icon: '✨', desc: 'ተጠቀም ንድፍ', range: 75, columns: 5 },
            { id: 'coverall', name: 'ሙሉ ቤት', icon: '🏆', desc: 'ሁሉንም ምልክት ያድርጉ', range: 90, columns: 9 }
        ];
        
        // Initialize on load
        window.addEventListener('DOMContentLoaded', () => this.init());
    }

    // Initialize the client
    init() {
        console.log('Initializing Bingo Multiplayer Client...');
        
        // Setup UI elements
        this.setupBoardSelection();
        this.setupBoardNumbers();
        this.setupEventListeners();
        
        // Load saved player data
        this.loadPlayerData();
        
        // Connect to WebSocket server
        this.connectWebSocket();
        
        // Start UI update interval
        setInterval(() => this.updateUI(), 1000);
    }

    // Connect to WebSocket server
    connectWebSocket() {
        // Determine WebSocket URL based on environment
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname === 'localhost' 
            ? 'localhost:8080' 
            : window.location.hostname;
        
        const wsUrl = `${protocol}//${host}/ws`;
        console.log('Connecting to WebSocket:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected successfully');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
            
            // Generate session ID if not exists
            if (!this.sessionId) {
                this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }
            
            // Send connection info
            this.sendToServer({
                type: 'connect',
                sessionId: this.sessionId,
                timestamp: Date.now()
            });
            
            // If player info exists, register with server
            if (this.playerInfo.name) {
                this.sendPlayerInfo();
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing server message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.updateConnectionStatus(false);
            this.attemptReconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showNotification('የሰርቨር ግንኙነት ችግር አጋጥሞታል', true);
        };
    }

    // Handle messages from server
    handleServerMessage(data) {
        console.log('Server message:', data.type, data);
        
        switch(data.type) {
            case 'connected':
                this.handleConnected(data);
                break;
                
            case 'game_state':
                this.handleGameState(data.state);
                break;
                
            case 'player_list':
                this.handlePlayerList(data.players);
                break;
                
            case 'player_joined':
                this.handlePlayerJoined(data);
                break;
                
            case 'player_left':
                this.handlePlayerLeft(data);
                break;
                
            case 'player_ready':
                this.handlePlayerReady(data);
                break;
                
            case 'game_started':
                this.handleGameStarted(data);
                break;
                
            case 'game_stopped':
                this.handleGameStopped();
                break;
                
            case 'number_called':
                this.handleNumberCalled(data);
                break;
                
            case 'winner':
                this.handleWinner(data);
                break;
                
            case 'chat_message':
                this.handleChatMessage(data);
                break;
                
            case 'error':
                this.handleError(data);
                break;
                
            case 'pong':
                // Server ping response
                break;
        }
    }

    // Handle connection established
    handleConnected(data) {
        this.playerId = data.playerId;
        console.log('Player ID assigned:', this.playerId);
        document.getElementById('playerIdDisplay').textContent = this.playerId.substr(0, 4);
        
        // Request current game state
        this.sendToServer({ type: 'get_game_state' });
    }

    // Handle game state update
    handleGameState(state) {
        this.gameState = { ...this.gameState, ...state };
        this.updateGameUI();
        
        // Show/hide current game info
        const gameInfo = document.getElementById('currentGameInfo');
        if (state.status && state.status !== 'finished') {
            gameInfo.style.display = 'block';
            document.getElementById('currentGameType').textContent = 
                this.getGameTypeName(state.type);
            document.getElementById('currentGamePlayers').textContent = 
                `${state.playerCount || 0}/${state.maxPlayers || 90}`;
            document.getElementById('currentGameStatus').textContent = 
                this.getStatusText(state.status);
            document.getElementById('currentGameStatus').className = 
                `info-value status-${state.status}`;
        } else {
            gameInfo.style.display = 'none';
        }
    }

    // Handle player list update
    handlePlayerList(players) {
        this.gameState.players = players;
        this.updatePlayerListUI(players);
        
        // Update player count
        document.getElementById('playersCount').textContent = players.length;
        document.getElementById('onlineCount').textContent = `${players.length} online`;
        document.getElementById('currentPlayers').textContent = players.length;
        
        // Find current player in list
        const currentPlayer = players.find(p => p.id === this.playerId);
        if (currentPlayer) {
            this.playerInfo.status = currentPlayer.status;
            this.playerInfo.balance = currentPlayer.balance || 0;
            this.updatePlayerStatus();
        }
    }

    // Handle player joined
    handlePlayerJoined(data) {
        this.showNotification(`${data.playerName} ጨዋታ ገብቷል`);
        this.updatePlayerListUI(data.players);
    }

    // Handle player left
    handlePlayerLeft(data) {
        this.showNotification(`${data.playerName} ጨዋታ ለቃል`);
        this.updatePlayerListUI(data.players);
    }

    // Handle player ready
    handlePlayerReady(data) {
        this.showNotification(`${data.playerName} ${data.status === 'ready' ? 'ዝግጁ ነው' : 'ዝግጅት ተሰርዟል'}`);
        this.updatePlayerListUI(data.players);
    }

    // Handle game started
    handleGameStarted(data) {
        this.gameState = data.game;
        this.showNotification('ጨዋታ ጀመረ!');
        
        // If player is ready, generate board and move to game page
        if (this.playerInfo.status === 'ready') {
            this.playerInfo.status = 'playing';
            this.generateBoard();
            this.showPage(4);
        }
    }

    // Handle game stopped
    handleGameStopped() {
        this.gameState.status = 'finished';
        this.showNotification('ጨዋታ አልቋል!');
        
        // Reset player status if in game
        if (this.playerInfo.status === 'playing' || this.playerInfo.status === 'won') {
            this.playerInfo.status = 'waiting';
            this.playerInfo.markedNumbers.clear();
            this.showPage(3);
        }
    }

    // Handle number called
    handleNumberCalled(data) {
        const displayNumber = data.displayNumber || data.number;
        
        // Update current number display
        document.getElementById('currentNumberDisplay').textContent = displayNumber;
        
        // Add to called numbers display
        this.addCalledNumber(displayNumber);
        
        // Update count
        const calledCount = document.getElementById('calledCount');
        calledCount.textContent = parseInt(calledCount.textContent) + 1;
        
        // Auto-mark if enabled
        if (this.playerInfo.autoMark && this.playerInfo.boardElement) {
            this.autoMarkNumber(data.number);
        }
        
        // Play sound
        if (this.audioEnabled) {
            this.playSound('call');
        }
        
        // Flash the circular call button
        const btn = document.getElementById('circularCallBtn');
        btn.classList.add('calling');
        setTimeout(() => btn.classList.remove('calling'), 1000);
    }

    // Handle winner
    handleWinner(data) {
        const winner = data.winner;
        
        // Play win sound
        if (this.audioEnabled) {
            this.playSound('win');
        }
        
        // Show winner notification
        if (winner.playerId === this.playerId) {
            this.showWinnerNotification('እርስዎ!', winner.pattern, winner.amount);
            this.playerInfo.balance += winner.amount;
            this.playerInfo.status = 'won';
            
            // Update balance display
            document.getElementById('balanceDisplay').textContent = this.playerInfo.balance;
        } else {
            this.showNotification(`${winner.playerName} አሸነፈ!`);
        }
        
        // Add to game winners
        this.gameState.winners.push(winner);
    }

    // Handle chat message
    handleChatMessage(data) {
        this.addChatMessage(data.message);
    }

    // Handle error
    handleError(data) {
        this.showNotification(data.message, true);
    }

    // Send message to server
    sendToServer(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket not connected, message not sent:', message);
        }
    }

    // Send player info to server
    sendPlayerInfo() {
        this.sendToServer({
            type: 'player_info',
            playerId: this.playerId,
            name: this.playerInfo.name,
            phone: this.playerInfo.phone,
            stake: this.playerInfo.stake,
            boardId: this.playerInfo.boardId,
            gameType: this.gameState.type
        });
    }

    // Join game
    joinGame() {
        const name = document.getElementById('playerName').value.trim();
        const phone = document.getElementById('playerPhone').value.trim();
        const stake = parseInt(document.getElementById('playerStake').value) || 25;
        const boardId = document.getElementById('boardSelect').value;
        
        // Validate inputs
        if (!name || name.length < 2) {
            this.showNotification('እባክዎ ትክክለኛ ስም ያስገቡ', true);
            return;
        }
        
        if (!phone || phone.length < 10) {
            this.showNotification('እባክዎ ትክክለኛ ስልክ ያስገቡ', true);
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
        
        // Update UI
        document.getElementById('playerDisplayName').textContent = name;
        document.getElementById('displayStake').textContent = `${stake} ብር`;
        
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
        
        const newStatus = this.playerInfo.isReady ? 'waiting' : 'ready';
        this.playerInfo.isReady = !this.playerInfo.isReady;
        
        this.sendToServer({
            type: 'player_ready',
            playerId: this.playerId,
            status: newStatus
        });
        
        // Update button
        const btn = document.getElementById('readyBtn');
        btn.textContent = this.playerInfo.isReady ? 'እየጠበቅኩ ነው' : 'ዝግጁ ነኝ';
        btn.classList.toggle('btn-success', this.playerInfo.isReady);
        btn.classList.toggle('btn-info', !this.playerInfo.isReady);
    }

    // Leave lobby
    leaveLobby() {
        if (confirm('ከምደባ ለመውጣት እርግጠኛ ነዎት?')) {
            this.playerInfo.status = 'waiting';
            this.playerInfo.isReady = false;
            this.showPage(0);
        }
    }

    // Leave game
    leaveGame() {
        if (confirm('ከጨዋታ ለመውጣት እርግጠኛ ነዎት?')) {
            this.playerInfo.status = 'waiting';
            this.playerInfo.markedNumbers.clear();
            this.showPage(3);
        }
    }

    // Claim bingo
    claimBingo() {
        if (!this.playerId || this.playerInfo.status !== 'playing') return;
        
        // Check for winning pattern
        const winPattern = this.checkWinPattern();
        
        if (winPattern) {
            this.sendToServer({
                type: 'claim_bingo',
                playerId: this.playerId,
                pattern: winPattern,
                markedNumbers: Array.from(this.playerInfo.markedNumbers)
            });
            
            // Disable bingo button temporarily
            document.getElementById('bingoBtn').disabled = true;
            setTimeout(() => {
                if (this.playerInfo.status === 'playing') {
                    document.getElementById('bingoBtn').disabled = false;
                }
            }, 5000);
        } else {
            this.showNotification('የማሸነፍ ንድፍ አላጠናቀቁም!', true);
        }
    }

    // Send chat message
    sendChatMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.playerId) {
            this.sendToServer({
                type: 'chat_message',
                playerId: this.playerId,
                message: message
            });
            input.value = '';
        }
    }

    // Generate game board
    generateBoard() {
        const container = document.getElementById('gameBoard');
        const gameType = this.gameState.type;
        
        // Clear container
        container.innerHTML = '';
        
        // Generate based on game type
        switch(gameType) {
            case '75ball':
                this.generate75BallBoard(container);
                break;
            case '90ball':
                this.generate90BallBoard(container);
                break;
            case '30ball':
                this.generate30BallBoard(container);
                break;
            case '50ball':
                this.generate50BallBoard(container);
                break;
            case 'pattern':
                this.generatePatternBoard(container);
                break;
            case 'coverall':
                this.generateCoverallBoard(container);
                break;
            default:
                this.generate75BallBoard(container);
        }
    }

    // Generate 75-ball board
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
        const columnRanges = [[1,15], [16,30], [31,45], [46,60], [61,75]];
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
                
                if (row === 2 && col === 2) {
                    // Center free space
                    cell.textContent = '★';
                    cell.classList.add('center-cell');
                    cell.classList.add('marked');
                } else {
                    const num = columnNumbers[col][row];
                    cell.textContent = num;
                    cell.dataset.number = num;
                    cell.dataset.row = row;
                    cell.dataset.col = col;
                    
                    cell.onclick = () => this.toggleNumberMark(num, cell);
                }
                
                grid.appendChild(cell);
            }
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.playerInfo.boardElement = grid;
    }

    // Generate 90-ball board
    generate90BallBoard(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'board-90-wrapper';
        
        // Column labels
        const labels = document.createElement('div');
        labels.className = 'board-90-labels';
        for (let i = 1; i <= 9; i++) {
            const label = document.createElement('div');
            label.className = 'board-90-label';
            label.textContent = `${(i-1)*10+1}-${i*10}`;
            labels.appendChild(label);
        }
        wrapper.appendChild(labels);
        
        // Board grid
        const grid = document.createElement('div');
        grid.className = 'board-90';
        
        // Generate 90-ball board layout
        const ranges = [
            [1,10], [11,20], [21,30], [31,40], [41,50],
            [51,60], [61,70], [71,80], [81,90]
        ];
        
        const columnNumbers = ranges.map(range => {
            const count = Math.floor(Math.random() * 3) + 1;
            let nums = new Set();
            while (nums.size < count) {
                nums.add(Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]);
            }
            return Array.from(nums).sort((a, b) => a - b);
        });
        
        const layout = Array(3).fill().map(() => Array(9).fill(null));
        
        columnNumbers.forEach((nums, col) => {
            const positions = [0,1,2].sort(() => Math.random() - 0.5).slice(0, nums.length);
            positions.forEach((row, idx) => {
                layout[row][col] = nums[idx];
            });
        });
        
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 9; col++) {
                const cell = document.createElement('button');
                cell.className = 'board-cell';
                const num = layout[row][col];
                
                if (num) {
                    cell.textContent = num;
                    cell.dataset.number = num;
                    cell.dataset.row = row;
                    cell.dataset.col = col;
                    
                    cell.onclick = () => this.toggleNumberMark(num, cell);
                } else {
                    cell.classList.add('blank-cell');
                    cell.textContent = '✗';
                }
                
                grid.appendChild(cell);
            }
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.playerInfo.boardElement = grid;
    }

    // Generate 30-ball board
    generate30BallBoard(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'board-30-wrapper';
        
        // Column labels
        const labels = document.createElement('div');
        labels.className = 'board-30-labels';
        for (let i = 1; i <= 3; i++) {
            const label = document.createElement('div');
            label.className = 'board-30-label';
            label.textContent = `${(i-1)*10+1}-${i*10}`;
            labels.appendChild(label);
        }
        wrapper.appendChild(labels);
        
        // Board grid
        const grid = document.createElement('div');
        grid.className = 'board-30';
        
        // Generate 9 unique numbers from 1-30
        let nums = new Set();
        while (nums.size < 9) {
            nums.add(Math.floor(Math.random() * 30) + 1);
        }
        const numbers = Array.from(nums).sort((a, b) => a - b);
        
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('button');
            cell.className = 'board-cell';
            cell.textContent = numbers[i];
            cell.dataset.number = numbers[i];
            cell.dataset.index = i;
            
            cell.onclick = () => this.toggleNumberMark(numbers[i], cell);
            
            grid.appendChild(cell);
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.playerInfo.boardElement = grid;
    }

    // Generate 50-ball board
    generate50BallBoard(container) {
        // Similar to 75-ball but with 50 numbers
        const wrapper = document.createElement('div');
        wrapper.className = 'board-50-wrapper';
        
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
        grid.className = 'board-50';
        
        // Generate numbers for each column (1-10, 11-20, etc.)
        const columnRanges = [[1,10], [11,20], [21,30], [31,40], [41,50]];
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
                
                if (row === 2 && col === 2) {
                    // Center free space
                    cell.textContent = '★';
                    cell.classList.add('center-cell');
                    cell.classList.add('marked');
                } else {
                    const num = columnNumbers[col][row];
                    cell.textContent = num;
                    cell.dataset.number = num;
                    cell.dataset.row = row;
                    cell.dataset.col = col;
                    
                    cell.onclick = () => this.toggleNumberMark(num, cell);
                }
                
                grid.appendChild(cell);
            }
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.playerInfo.boardElement = grid;
    }

    // Generate pattern board
    generatePatternBoard(container) {
        // Similar to 75-ball but with pattern highlighting
        this.generate75BallBoard(container);
        
        // Add pattern cells highlighting
        const pattern = this.gameState.pattern || 'x-pattern';
        const patternCells = this.getPatternCells(pattern);
        
        patternCells.forEach(pos => {
            const [row, col] = pos.split('-').map(Number);
            const cell = container.querySelector(`[data-row="${row}"][data-col="${col}"]`);
            if (cell) {
                cell.classList.add('pattern-cell');
            }
        });
    }

    // Generate coverall board
    generateCoverallBoard(container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'board-coverall-wrapper';
        
        // Column labels
        const labels = document.createElement('div');
        labels.className = 'board-coverall-labels';
        for (let i = 1; i <= 9; i++) {
            const label = document.createElement('div');
            label.className = 'board-coverall-label';
            label.textContent = `${(i-1)*10+1}-${i*10}`;
            labels.appendChild(label);
        }
        wrapper.appendChild(labels);
        
        // Board grid
        const grid = document.createElement('div');
        grid.className = 'board-coverall';
        
        // Generate 45 unique numbers from 1-90
        let nums = new Set();
        while (nums.size < 45) {
            nums.add(Math.floor(Math.random() * 90) + 1);
        }
        const numbers = Array.from(nums).sort((a, b) => a - b);
        
        for (let i = 0; i < 45; i++) {
            const cell = document.createElement('button');
            cell.className = 'board-cell';
            cell.textContent = numbers[i];
            cell.dataset.number = numbers[i];
            cell.dataset.index = i;
            
            cell.onclick = () => this.toggleNumberMark(numbers[i], cell);
            
            grid.appendChild(cell);
        }
        
        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.playerInfo.boardElement = grid;
    }

    // Get pattern cells
    getPatternCells(pattern) {
        const patterns = {
            'x-pattern': ['0-0', '0-4', '1-1', '1-3', '2-2', '3-1', '3-3', '4-0', '4-4'],
            'frame': ['0-0', '0-1', '0-2', '0-3', '0-4', '4-0', '4-1', '4-2', '4-3', '4-4', '1-0', '2-0', '3-0', '1-4', '2-4', '3-4'],
            'postage-stamp': ['0-0', '0-1', '1-0', '1-1', '3-3', '3-4', '4-3', '4-4'],
            'small-diamond': ['1-2', '2-1', '2-2', '2-3', '3-2']
        };
        return patterns[pattern] || patterns['x-pattern'];
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
        
        // Update counts
        this.updateMarkedCount();
        
        // Check for bingo
        this.checkBingoButton();
    }

    // Auto-mark number
    autoMarkNumber(number) {
        if (!this.playerInfo.boardElement || this.playerInfo.status !== 'playing') return;
        
        const cell = this.playerInfo.boardElement.querySelector(`[data-number="${number}"]`);
        if (cell && !cell.classList.contains('marked')) {
            cell.classList.add('marked');
            this.playerInfo.markedNumbers.add(number);
            
            // Update counts
            this.updateMarkedCount();
            
            // Check for bingo
            this.checkBingoButton();
        }
    }

    // Update marked count
    updateMarkedCount() {
        const markedCount = this.playerInfo.markedNumbers.size;
        document.getElementById('markedCount').textContent = markedCount;
        
        // Update remaining count based on game type
        const totalCells = this.getTotalCells();
        const remaining = totalCells - markedCount;
        document.getElementById('remainingCount').textContent = remaining;
    }

    // Get total cells for current game type
    getTotalCells() {
        switch(this.gameState.type) {
            case '75ball':
            case '50ball':
            case 'pattern':
                return 24; // 5x5 minus center
            case '90ball':
                return 15; // 9x3
            case '30ball':
                return 9; // 3x3
            case 'coverall':
                return 45; // 9x5
            default:
                return 24;
        }
    }

    // Check for winning pattern
    checkWinPattern() {
        const gameType = this.gameState.type;
        const marked = this.playerInfo.markedNumbers;
        
        if (gameType === '75ball' || gameType === '50ball' || gameType === 'pattern') {
            // Check rows
            for (let row = 0; row < 5; row++) {
                let rowComplete = true;
                for (let col = 0; col < 5; col++) {
                    if (row === 2 && col === 2) continue; // Free space
                    const cell = this.playerInfo.boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                    if (cell && !cell.classList.contains('marked')) {
                        rowComplete = false;
                        break;
                    }
                }
                if (rowComplete) return 'row';
            }
            
            // Check columns
            for (let col = 0; col < 5; col++) {
                let colComplete = true;
                for (let row = 0; row < 5; row++) {
                    if (row === 2 && col === 2) continue; // Free space
                    const cell = this.playerInfo.boardElement.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                    if (cell && !cell.classList.contains('marked')) {
                        colComplete = false;
                        break;
                    }
                }
                if (colComplete) return 'column';
            }
            
            // Check diagonals
            let diag1Complete = true;
            let diag2Complete = true;
            for (let i = 0; i < 5; i++) {
                if (i === 2) continue; // Skip center
                
                const cell1 = this.playerInfo.boardElement.querySelector(`[data-row="${i}"][data-col="${i}"]`);
                const cell2 = this.playerInfo.boardElement.querySelector(`[data-row="${i}"][data-col="${4-i}"]`);
                
                if (cell1 && !cell1.classList.contains('marked')) diag1Complete = false;
                if (cell2 && !cell2.classList.contains('marked')) diag2Complete = false;
            }
            
            if (diag1Complete || diag2Complete) return 'diagonal';
            
            // Check four corners
            const corners = [
                this.playerInfo.boardElement.querySelector('[data-row="0"][data-col="0"]'),
                this.playerInfo.boardElement.querySelector('[data-row="0"][data-col="4"]'),
                this.playerInfo.boardElement.querySelector('[data-row="4"][data-col="0"]'),
                this.playerInfo.boardElement.querySelector('[data-row="4"][data-col="4"]')
            ];
            
            if (corners.every(cell => cell && cell.classList.contains('marked'))) {
                return 'four-corners';
            }
            
            // Check full house (all cells marked)
            if (marked.size >= 24) { // All except center
                return 'full-house';
            }
        }
        
        // Add checks for other game types as needed
        
        return null;
    }

    // Check bingo button state
    checkBingoButton() {
        const btn = document.getElementById('bingoBtn');
        const hasBingo = this.checkWinPattern();
        btn.disabled = !hasBingo;
    }

    // Add called number to display
    addCalledNumber(number) {
        this.calledNumbersDisplay.unshift(number);
        if (this.calledNumbersDisplay.length > 8) {
            this.calledNumbersDisplay = this.calledNumbersDisplay.slice(0, 8);
        }
        
        // Update UI
        const scroll = document.getElementById('calledNumbersScroll');
        scroll.innerHTML = '';
        
        this.calledNumbersDisplay.forEach(num => {
            const span = document.createElement('span');
            span.className = 'called-number';
            span.textContent = num;
            scroll.appendChild(span);
        });
    }

    // Add chat message
    addChatMessage(message) {
        this.chatMessages.push(message);
        if (this.chatMessages.length > 50) {
            this.chatMessages.shift();
        }
        
        // Update UI if in lobby
        if (this.getCurrentPage() === 3) {
            const container = document.getElementById('chatMessages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'chat-message';
            messageDiv.innerHTML = `
                <div class="message-sender">${message.sender}:</div>
                <div class="message-text amharic-text">${message.text}</div>
                <div class="message-time">${this.formatTime(message.timestamp)}</div>
            `;
            container.appendChild(messageDiv);
            container.scrollTop = container.scrollHeight;
            
            // Update message count
            document.getElementById('messageCount').textContent = this.chatMessages.length;
        }
    }

    // Show notification
    showNotification(message, isError = false) {
        const notification = document.getElementById('globalNotification');
        const content = document.getElementById('notificationContent');
        
        content.textContent = message;
        content.style.color = isError ? '#dc3545' : '#ffd700';
        
        notification.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (notification.style.display === 'block') {
                notification.style.display = 'none';
            }
        }, 3000);
    }

    // Show winner notification
    showWinnerNotification(winner, pattern, amount) {
        document.getElementById('winnerName').textContent = winner;
        document.getElementById('winPattern').textContent = this.getPatternName(pattern);
        document.getElementById('winAmount').textContent = `${amount.toLocaleString()} ብር`;
        document.getElementById('winnerNotification').style.display = 'block';
    }

    // Hide winner notification
    hideWinner() {
        document.getElementById('winnerNotification').style.display = 'none';
    }

    // Hide notification
    hideNotification() {
        document.getElementById('globalNotification').style.display = 'none';
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
            
            this.showNotification(`ዳግም መገናኘት... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
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
        const btn = document.getElementById('audioBtn');
        btn.textContent = this.audioEnabled ? '🔊' : '🔇';
        btn.title = this.audioEnabled ? 'ድምጽ አብራ' : 'ድምጽ አጥፋ';
    }

    // Toggle auto-mark
    toggleAutoMark() {
        this.playerInfo.autoMark = !this.playerInfo.autoMark;
        const btn = document.getElementById('autoMarkText');
        btn.textContent = this.playerInfo.autoMark ? 'ራስ-ሰር ምልክት' : 'እጅ በእጅ ምልክት';
    }

    // Format time
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // Less than 1 minute
            return 'አሁን';
        } else if (diff < 3600000) { // Less than 1 hour
            return Math.floor(diff / 60000) + ' ደቂቃ በፊት';
        } else if (diff < 86400000) { // Less than 1 day
            return Math.floor(diff / 3600000) + ' ሰዓት በፊት';
        } else {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    // Get game type name
    getGameTypeName(type) {
        const board = this.boardTypes.find(t => t.id === type);
        return board ? board.name : '75-ቢንጎ';
    }

    // Get status text
    getStatusText(status) {
        const statusMap = {
            'waiting': 'በመጠባበቅ ላይ',
            'running': 'በመጫወት ላይ',
            'finished': 'ያልቋል'
        };
        return statusMap[status] || status;
    }

    // Get pattern name
    getPatternName(pattern) {
        const patternMap = {
            'row': 'ረድፍ',
            'column': 'አምድ',
            'diagonal': 'ዲያግናል',
            'four-corners': 'አራት ማእዘኖች',
            'full-house': 'ሙሉ ቤት',
            'x-pattern': 'X ንድፍ',
            'frame': 'አውራ ቀለበት',
            'postage-stamp': 'ማህተም',
            'small-diamond': 'ዲያምንድ'
        };
        return patternMap[pattern] || pattern;
    }

    // Update game UI
    updateGameUI() {
        // Update game status
        const statusElement = document.getElementById('gameStatus');
        if (statusElement) {
            statusElement.textContent = this.getStatusText(this.gameState.status);
            statusElement.className = `game-status ${this.gameState.status}`;
        }
        
        // Update lobby title
        const titleElement = document.getElementById('lobbyTitle');
        if (titleElement && this.gameState.type) {
            titleElement.textContent = `${this.getGameTypeName(this.gameState.type)} - ምደባ`;
        }
        
        // Update displayed game type
        const displayType = document.getElementById('displayGameType');
        if (displayType) {
            displayType.textContent = this.getGameTypeName(this.gameState.type);
        }
    }

    // Update player list UI
    updatePlayerListUI(players) {
        const container = document.getElementById('playersList');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (players.length === 0) {
            container.innerHTML = '<div class="empty-list amharic-text">ተጫዋቾች አልተገኙም...</div>';
            return;
        }
        
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
            
            // Highlight current player
            if (player.id === this.playerId) {
                item.style.borderLeftColor = '#ffd700';
                item.style.background = 'rgba(255, 215, 0, 0.1)';
            }
            
            container.appendChild(item);
        });
    }

    // Update player status
    updatePlayerStatus() {
        // Update ready button based on status
        const readyBtn = document.getElementById('readyBtn');
        if (readyBtn) {
            if (this.playerInfo.status === 'playing') {
                readyBtn.disabled = true;
                readyBtn.textContent = 'በመጫወት ላይ';
            } else {
                readyBtn.disabled = false;
                readyBtn.textContent = this.playerInfo.isReady ? 'እየጠበቅኩ ነው' : 'ዝግጁ ነኝ';
                readyBtn.classList.toggle('btn-success', this.playerInfo.isReady);
                readyBtn.classList.toggle('btn-info', !this.playerInfo.isReady);
            }
        }
        
        // Update bingo button
        const bingoBtn = document.getElementById('bingoBtn');
        if (bingoBtn) {
            bingoBtn.disabled = this.playerInfo.status !== 'playing';
        }
    }

    // Update lobby info
    updateLobbyInfo() {
        document.getElementById('lobbyGameType').textContent = 
            this.getGameTypeName(this.gameState.type);
        
        document.getElementById('lobbyStake').textContent = `${this.gameState.stake} ብር`;
        
        // Calculate potential prize (80% of total stakes)
        const totalStake = this.gameState.players.reduce((sum, player) => sum + player.stake, 0);
        const prize = Math.floor(totalStake * 0.8);
        document.getElementById('lobbyPrize').textContent = `${prize.toLocaleString()} ብር`;
        
        // Update potential win in registration
        document.getElementById('potentialWin').textContent = `${prize.toLocaleString()} ብር`;
    }

    // Update UI periodically
    updateUI() {
        // Update balance display
        document.getElementById('balanceDisplay').textContent = this.playerInfo.balance;
        
        // Update player count if not in lobby
        if (this.getCurrentPage() !== 3 && this.gameState.players) {
            document.getElementById('playersCount').textContent = this.gameState.players.length;
        }
    }

    // Setup board selection
    setupBoardSelection() {
        const grid = document.getElementById('boardTypeGrid');
        grid.innerHTML = '';
        
        this.boardTypes.forEach(type => {
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
                
                // Update next button
                document.getElementById('nextBtn').disabled = false;
            };
            
            grid.appendChild(card);
        });
        
        // Select first board by default
        if (grid.firstChild) {
            grid.firstChild.click();
        }
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
        select.value = 1;
    }

    // Setup event listeners
    setupEventListeners() {
        // Stake amount change
        document.getElementById('playerStake').addEventListener('change', (e) => {
            const stake = parseInt(e.target.value);
            document.getElementById('stakeAmount').textContent = `${stake} ብር`;
            document.getElementById('displayStake').textContent = `${stake} ብር`;
            
            // Update potential win
            const potential = Math.floor(90 * stake * 0.8);
            document.getElementById('potentialWin').textContent = `${potential.toLocaleString()} ብር`;
        });
        
        // Next button in board selection
        document.getElementById('nextBtn').onclick = () => {
            if (this.gameState.type) {
                this.showPage(2);
            } else {
                this.showNotification('እባክዎ የቦርድ ዓይነት ይምረጡ', true);
            }
        };
        
        // Chat input enter key
        document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendChatMessage();
            }
        });
        
        // Player search
        document.getElementById('playerSearch')?.addEventListener('input', (e) => {
            this.filterPlayers(e.target.value);
        });
    }

    // Filter players in list
    filterPlayers(searchTerm) {
        const items = document.querySelectorAll('.player-item');
        items.forEach(item => {
            const name = item.querySelector('.player-name').textContent.toLowerCase();
            const phone = item.querySelector('.player-phone').textContent.toLowerCase();
            const search = searchTerm.toLowerCase();
            
            if (name.includes(search) || phone.includes(search)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    // Save player data to localStorage
    savePlayerData() {
        const data = {
            name: this.playerInfo.name,
            phone: this.playerInfo.phone,
            stake: this.playerInfo.stake,
            sessionId: this.sessionId
        };
        localStorage.setItem('bingo_player_data', JSON.stringify(data));
    }

    // Load player data from localStorage
    loadPlayerData() {
        const saved = localStorage.getItem('bingo_player_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.playerInfo.name = data.name || '';
                this.playerInfo.phone = data.phone || '';
                this.playerInfo.stake = data.stake || 25;
                this.sessionId = data.sessionId || this.sessionId;
                
                // Fill form fields
                document.getElementById('playerName').value = this.playerInfo.name;
                document.getElementById('playerPhone').value = this.playerInfo.phone;
                document.getElementById('playerStake').value = this.playerInfo.stake;
                document.getElementById('playerDisplayName').textContent = this.playerInfo.name || 'Guest';
            } catch (e) {
                console.log('Could not load saved player data');
            }
        }
    }

    // Get current page number
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
        
        // Special handling for each page
        switch(pageNum) {
            case 3: // Lobby
                this.updateLobbyInfo();
                break;
            case 4: // Game board
                if (this.playerInfo.status === 'playing') {
                    this.generateBoard();
                }
                break;
        }
    }
}

// Create global instance
const bingoClient = new BingoMultiplayerClient();

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

function leaveLobby() {
    bingoClient.leaveLobby();
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

function toggleAutoMark() {
    bingoClient.toggleAutoMark();
}

function showMembers() {
    // Show members modal (simplified)
    bingoClient.showNotification('ተጫዋቾች በምደባ ገጽ ላይ ይመለከታሉ');
}

function showPotentialWin() {
    // Show potential win modal (simplified)
    const stake = parseInt(document.getElementById('playerStake').value) || 25;
    const potential = Math.floor(90 * stake * 0.8);
    bingoClient.showNotification(`ሊያሸንፉት: ${potential.toLocaleString()} ብር`);
}

function hideWinner() {
    bingoClient.hideWinner();
}

function hideNotification() {
    bingoClient.hideNotification();
}

// Initialize when page loads
window.addEventListener('load', () => {
    // Additional initialization if needed
});
