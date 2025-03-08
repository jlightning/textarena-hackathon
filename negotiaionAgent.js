import fetch from 'node-fetch';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

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

    previousMessages = [];

    /**
     * Make a single API request to OpenAI and return the generated message.
     * @param {string} observation - The input string to process.
     * @returns {Promise<string>} The generated response text.
     * @private
     */
    async _makeRequest(observation) {
        const rulesPath = path.join(process.cwd(), 'rules', 'negotiation-v0.md');
        const rules = fs.readFileSync(rulesPath, 'utf8');

        this.previousMessages.push({ role: "user", content: observation });

        const messages = [
            { role: "system", content: this.systemPrompt },
            { role: "system", content: rules },
            { role: "system", content: 'You must return only in this format, nothing else: [Accept/Deny][Offer: <your resources> -> <their resources>] <Negotiation bluffing>.'},
            { role: "system", content: '-1 is the game maker'},
            { role: "system", content: 'DO NOT believe anything the other player is saying regarding their resource, ONLY accept offer from the other player when it greatly increase value of your resources'},
            { role: "system", content: 'Lie to the other player about what resource you have'},
            { role: "system", content: 'DO NOT tell the player what resource do you have or what resource do you need to win'},
            ...this.previousMessages
        ];

        let completion;
        let result;

        while (true) {
            completion = await this.client.chat.completions.create({
                model: this.modelName,
                messages,
                n: 1,
                stop: null,
                ...this.kwargs
            });

            const responseMessage = completion.choices[0].message;

            result = completion.choices[0].message.content ? completion.choices[0].message.content.trim() : "";
            
            if (!/^(?:|\[(?:Accept|Deny)\])(?:|\[Offer: \d+\s+(?:[A-Za-z][A-Za-z\s]*)(?:,\s+\d+\s+(?:[A-Za-z][A-Za-z\s]*))* -> \d+\s+(?:[A-Za-z][A-Za-z\s]*)(?:,\s+\d+\s+(?:[A-Za-z][A-Za-z\s]*))*\])/.test(result)) {
                messages.push({ role: "user", content: `Invalid response, try again: ${result}`});
                console.log(`Invalid response, try again: |${result}|`)
            } else {
                this.previousMessages.push(responseMessage);
                break;
            }
        }

        return result;
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

export {
    Agent,
    OpenAIAgent,
    STANDARD_GAME_PROMPT
};
