import fetch from 'node-fetch';
import OpenAI from 'openai';

const STANDARD_GAME_PROMPT = "You are a competitive game player. Make sure you read the game instructions carefully, and always follow the required format.";

class Agent {
    constructor() {
        // Base agent class
    }

    async call(observation) {
        throw new Error('Not implemented');
    }
}

class OpenAIAgent extends Agent {
    /**
     * Initialize the OpenAI agent.
     * @param {string} modelName - The name of the model.
     * @param {string} [systemPrompt=STANDARD_GAME_PROMPT] - The system prompt to use.
     * @param {boolean} [verbose=false] - If True, additional debug info will be printed.
     * @param {Object} [kwargs={}] - Additional keyword arguments to pass to the OpenAI API call.
     */
    constructor(modelName, systemPrompt = STANDARD_GAME_PROMPT, verbose = false, kwargs = {}) {
        super();
        this.modelName = modelName;
        this.systemPrompt = systemPrompt;
        this.verbose = verbose;
        this.kwargs = kwargs;

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("OpenAI API key not found. Please set the OPENAI_API_KEY environment variable.");
        }

        this.client = new OpenAI({ apiKey });
    }

    /**
     * Make a single API request to OpenAI and return the generated message.
     * @param {string} observation - The input string to process.
     * @returns {Promise<string>} The generated response text.
     * @private
     */
    async _makeRequest(observation) {
        const messages = [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: observation }
        ];

        const completion = await this.client.chat.completions.create({
            model: this.modelName,
            messages,
            n: 1,
            stop: null,
            ...this.kwargs
        });

        return completion.choices[0].message.content.trim();
    }

    /**
     * Attempt to make an API request with retries.
     * @param {string} observation - The input to process.
     * @param {number} [retries=3] - The number of attempts to try.
     * @param {number} [delay=5] - Seconds to wait between attempts.
     * @returns {Promise<string>} The generated response.
     * @private
     */
    async _retryRequest(observation, retries = 3, delay = 5) {
        let lastError = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this._makeRequest(observation);
                if (this.verbose) {
                    console.log(`\nObservation: ${observation}\nResponse: ${response}`);
                }
                return response;
            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed with error: ${error}`);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
            }
        }

        throw lastError;
    }

    /**
     * Process the observation using the OpenAI API and return the generated response.
     * @param {string} observation - The input string to process.
     * @returns {Promise<string>} The generated response.
     */
    async call(observation) {
        if (typeof observation !== 'string') {
            throw new TypeError(`Observation must be a string. Received type: ${typeof observation}`);
        }
        return this._retryRequest(observation);
    }
}

class OpenRouterAgent extends Agent {
    /**
     * Initialize the OpenRouter agent.
     * @param {string} modelName - The name of the model (e.g. "gpt-4").
     * @param {string} [systemPrompt=STANDARD_GAME_PROMPT] - The system prompt to use.
     * @param {boolean} [verbose=false] - If True, additional debug info will be printed.
     * @param {Object} [kwargs={}] - Additional keyword arguments to pass to the API call.
     */
    constructor(modelName, systemPrompt = STANDARD_GAME_PROMPT, verbose = false, kwargs = {}) {
        super();
        this.modelName = modelName;
        this.systemPrompt = systemPrompt;
        this.verbose = verbose;
        this.kwargs = kwargs;

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            throw new Error("OpenRouter API key not found. Please set the OPENROUTER_API_KEY environment variable.");
        }
    }

    /**
     * Make a single API request to OpenRouter and return the generated message.
     * @param {string} observation - The input string to process.
     * @returns {Promise<string>} The generated response text.
     * @private
     */
    async _makeRequest(observation) {
        const messages = [
            { role: "system", content: this.systemPrompt },
            { role: "user", content: observation }
        ];

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://textarena.ai',
                'X-Title': 'TextArena'
            },
            body: JSON.stringify({
                model: this.modelName,
                messages,
                ...this.kwargs
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();
    }

    /**
     * Attempt to make an API request with retries.
     * @param {string} observation - The input to process.
     * @param {number} [retries=3] - The number of attempts to try.
     * @param {number} [delay=5] - Seconds to wait between attempts.
     * @returns {Promise<string>} The generated response.
     * @private
     */
    async _retryRequest(observation, retries = 3, delay = 5) {
        let lastError = null;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await this._makeRequest(observation);
                if (this.verbose) {
                    console.log(`\nObservation: ${observation}\nResponse: ${response}`);
                }
                return response;
            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed with error: ${error}`);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
            }
        }

        throw lastError;
    }

    /**
     * Process the observation using the OpenRouter API and return the generated response.
     * @param {string} observation - The input string to process.
     * @returns {Promise<string>} The generated response.
     */
    async call(observation) {
        if (typeof observation !== 'string') {
            throw new TypeError(`Observation must be a string. Received type: ${typeof observation}`);
        }
        return this._retryRequest(observation);
    }
}

export {
    Agent,
    OpenAIAgent,
    OpenRouterAgent,
    STANDARD_GAME_PROMPT
};
