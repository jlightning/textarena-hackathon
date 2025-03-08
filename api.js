import WebSocket from 'ws';
import fetch from 'node-fetch';

// Constants
const WS_SERVER_URI = "wss://api.textarena.ai/ws";
const HTTP_SERVER_URI = "https://api.textarena.ai";

const NAME_TO_ID_DICT = {
    "Chess-v0": 0,
    "ConnectFour-v0": 1,
    "DontSayIt-v0": 3,
    "Battleship-v0": 5,
    "LiarsDice-v0": 6,
    "SimpleNegotiation-v0": 8,
    "Poker-v0": 9,
    "SpellingBee-v0": 10,
    "SpiteAndMalice-v0": 11,
    "Stratego-v0": 12,
    "Tak-v0": 13,
    "TruthAndDeception-v0": 14,
    "UltimateTicTacToe-v0": 15,
    "TicTacToe-v0": 35,
    "Breakthrough-v0": 37,
    "Checkers-v0": 38,
    "KuhnPoker-v0": 46,
    "LetterAuction-v0": 47,
    "Nim-v0": 50,
    "Othello-v0": 51,
    "PigDice-v0": 52,
    "Snake-v0": 69
};

class OnlineEnvWrapper {
    constructor(envIds, modelName, modelToken) {
        this.envIds = envIds;
        this.modelName = modelName;
        this.modelToken = modelToken;
        this.websocket = null;
        
        // The full observations are stored as a Map of player id -> array of [sender_id, message] tuples
        this.fullObservations = new Map();
        
        // For synchronization between websocket and game loop
        this.currentPlayerId = null;
        this.currentObservation = null;
        this.gameOver = false;
        this.rewards = {};
        this.info = {};
        
        // Timeouts for waiting (in milliseconds)
        this.queueTimeout = 1800000;  // 30 minutes for matchmaking
        this.gameTimeout = 300000;    // 5 minutes for game moves
        
        // State tracking
        this.inGame = false;
        this.waitingForActionResponse = false;
        this.connectionEstablished = false;
        
        // Dummy state for compatibility if needed
        this.state = {
            roleMapping: { 0: "Player 0", 1: "Player 1", "-1": "GAME" }
        };
    }

    async connect() {
        try {
            const params = new URLSearchParams({
                model_name: this.modelName,
                model_token: this.modelToken
            });

            console.log(`Connecting to ${WS_SERVER_URI}?${params.toString()}`);
            this.websocket = new WebSocket(`${WS_SERVER_URI}?${params.toString()}`);

            // Set up WebSocket event handlers
            this.websocket.onopen = () => {
                console.log("Connected to server");
                this.connectionEstablished = true;
                
                // Queue for a game
                const queueCommand = {
                    command: "queue",
                    environments: this.envIds
                };
                this.websocket.send(JSON.stringify(queueCommand));
                console.log("Sent queue request");
            };

            this.websocket.onmessage = (event) => {
                this.handleMessage(event.data);
            };

            this.websocket.onerror = (error) => {
                console.error("WebSocket error:", error);
            };

            this.websocket.onclose = () => {
                console.log("WebSocket connection closed");
                this.connectionEstablished = false;
            };

            return true;
        } catch (error) {
            console.error("Connection error:", error);
            return false;
        }
    }

    async handleMessage(message) {
        try {
            const payload = JSON.parse(message);
            const command = payload.command;

            console.log("Received message:", payload);

            switch (command) {
                case "queued":
                    const avgQueueTime = payload.avg_queue_time || 0;
                    const numActive = payload.num_active_players || 0;
                    console.log(`Queued for game. Avg wait: ${avgQueueTime}s, Active players: ${numActive}`);
                    break;

                case "match_found":
                    this.inGame = true;
                    const playerId = payload.player_id;
                    const obs = payload.observation || [];

                    console.log(`Match found! Playing as player ${playerId}`);

                    if (obs.length) {
                        this.currentPlayerId = playerId;
                        this.fullObservations.set(playerId, obs);
                        this.currentObservation = obs;
                        console.log(`Starting player received observation of length ${obs.length}`);
                    } else {
                        this.currentPlayerId = playerId;
                        console.log("Waiting for first observation (not starting player)");
                    }
                    break;

                case "observation":
                    const newObs = payload.observation || [];
                    const newPlayerId = payload.player_id;

                    if (newObs.length) {
                        this.currentPlayerId = newPlayerId;
                        this.fullObservations.set(newPlayerId, newObs);
                        this.currentObservation = newObs;
                        console.log(`Received observation for player ${newPlayerId}, length: ${newObs.length}`);
                    }

                    this.waitingForActionResponse = false;
                    break;

                case "game_over":
                    this.gameOver = true;
                    const gameId = payload.game_id;
                    const opponent = payload.opponent_name || "Unknown";
                    const outcome = payload.outcome || "unknown";
                    const reason = payload.reason || "No reason provided";

                    console.log(`Game over! ID: ${gameId}, Opponent: ${opponent}, Outcome: ${outcome}, Reason: ${reason}`);

                    const changeInSkill = payload.change_in_skill;
                    if (changeInSkill !== undefined) {
                        this.rewards[this.currentPlayerId] = parseFloat(changeInSkill);
                    }

                    this.info = { reason, outcome };
                    break;

                case "error":
                    const errorMsg = payload.message || "Unknown error";
                    console.error(`Received error from server: ${errorMsg}`);
                    this.gameOver = true;
                    this.info = { error: errorMsg };
                    break;

                default:
                    console.log(`Unknown command received: ${command}`);
            }
        } catch (error) {
            console.error(`Error processing message: ${error}, message: ${message}`);
        }
    }

    async getObservation() {
        if (this.currentPlayerId !== null && this.currentObservation) {
            return [this.currentPlayerId, this.currentObservation];
        }

        if (!this.gameOver) {
            const timeout = this.inGame ? this.gameTimeout : this.queueTimeout;
            const startTime = Date.now();

            while (!this.gameOver) {
                if (this.currentPlayerId !== null && this.currentObservation) {
                    return [this.currentPlayerId, this.currentObservation];
                }

                await new Promise(resolve => setTimeout(resolve, 100));

                if (Date.now() - startTime > timeout) {
                    console.log("Timeout waiting for observation");
                    this.gameOver = true;
                    break;
                }
            }
        }

        return [null, []];
    }

    async step(action) {
        if (this.gameOver) {
            return [true, this.info];
        }

        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            const actionMsg = {
                command: "action",
                action: action
            };
            this.websocket.send(JSON.stringify(actionMsg));
            console.log("Sent action:", action);

            this.currentObservation = null;
            this.waitingForActionResponse = true;

            const startTime = Date.now();
            while (!this.gameOver && this.waitingForActionResponse) {
                await new Promise(resolve => setTimeout(resolve, 100));

                if (Date.now() - startTime > this.gameTimeout) {
                    console.log("Timeout waiting for action response");
                    this.gameOver = true;
                    break;
                }
            }
        }

        return [this.gameOver, this.info];
    }

    async reset(numPlayers = null) {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            const connected = await this.connect();
            if (!connected) {
                console.error("Failed to connect to server");
                return [];
            }
        }

        const startTime = Date.now();
        while (!this.gameOver && !this.inGame) {
            await new Promise(resolve => setTimeout(resolve, 100));

            if (Date.now() - startTime > this.queueTimeout) {
                console.log("Timeout waiting for match");
                this.gameOver = true;
                break;
            }
        }

        if (this.inGame && !this.currentObservation) {
            const [playerId, observation] = await this.getObservation();
            if (playerId !== null) {
                return observation;
            }
        }

        return this.currentObservation || [];
    }

    async close() {
        if (this.websocket) {
            this.websocket.close();
        }
        return this.rewards;
    }
}

async function makeOnline(envId, modelName, modelToken = null, modelDescription = null, email = null) {
    try {
        // Convert envId to array if it's a string
        const envIds = Array.isArray(envId) ? envId : [envId];
        let envIdsInt;
        
        if (envIds[0] === "all") {
            envIdsInt = Object.values(NAME_TO_ID_DICT);
        } else {
            envIdsInt = envIds.map(env => {
                if (!(env in NAME_TO_ID_DICT)) {
                    throw new Error(`Environment ${env} not recognized`);
                }
                return NAME_TO_ID_DICT[env];
            });
        }

        if (!modelToken) {
            if (!modelDescription || !email) {
                throw new Error("Provide modelDescription and email if modelToken is not given");
            }

            const response = await fetch(`${HTTP_SERVER_URI}/register_model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model_name: modelName,
                    description: modelDescription,
                    email: email
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            modelToken = data.model_token;
            console.log("Model registered successfully");
        }

        return new OnlineEnvWrapper(envIdsInt, modelName, modelToken);
    } catch (error) {
        console.error("Error in makeOnline:", error);
        throw error;
    }
}

export { OnlineEnvWrapper, makeOnline, NAME_TO_ID_DICT };
