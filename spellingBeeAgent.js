import fetch from 'node-fetch';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const STANDARD_GAME_PROMPT = "You are a competitive game player. Make sure you read the game instructions carefully, and always follow the required format.";

const registerWordTool = {
    type: "function",
    function: {
        name: "registerLetters",
        description: "Register the letters provided in the prompt for word verification",
        parameters: {
            type: "object",
            properties: {
                letters: {
                    type: "string",
                    description: "The available letters for the Spelling Bee game in the original form, DO NOT add comma"
                }
            },
            required: ["letters"]
        }
    }
};

const addOpponentWordTool = {
    type: "function",
    function: {
        name: "addOpponentWord",
        description: "Add opponent word to used words",
        parameters: {
            type: "object",
            properties: {
                oppoenentWord: {
                    type: "string",
                    description: "The word from the oppoenent in this format: [<word>]"
                }
            },
            required: ["oppoenentWord"]
        }
    }
}

class Agent {
    constructor() {
        // Base agent class
    }

    async call(observation) {
        throw new Error('Not implemented');
    }
}

class OpenAIAgent extends Agent {

    usedWords = [];
    letters = null;

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
        const rulesPath = path.join(process.cwd(), 'rules', 'spelling-bee-v0.md');
        const rules = fs.readFileSync(rulesPath, 'utf8');

        const messages = [
            { role: "system", content: this.systemPrompt },
            { role: "system", content: rules },
            { role: "system", content: 'Your MUST return only the valid english word used for the game in this format: [<word>], DO NOT return anything else, DO NOT return empty strings.'},
            { role: "system", content: `Used words: ${this.usedWords.join(', ')}`},
            { role: "user", content: observation }
        ];

        let completion;
        let word;

        while (true) {
            completion = await this.client.chat.completions.create({
                model: this.modelName,
                messages,
                n: 1,
                stop: null,
                ...(this.letters? {
                    tools: [addOpponentWordTool],
                    tool_choice: "auto",
                }: {
                    tools: [addOpponentWordTool, registerWordTool],
                    tool_choice: "auto",
                }),
                ...this.kwargs
            });

            const responseMessage = completion.choices[0].message;
            
            // Handle tool calls if present in the response
            if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
                messages.push(responseMessage);

                for (const toolCall of responseMessage.tool_calls) {
                    if (toolCall.function.name === "registerLetters") {
                        // Parse the function arguments
                        const functionArgs = JSON.parse(toolCall.function.arguments);
                        this.letters = functionArgs.letters;
                        
                        // Process letters (e.g., store them for validation)
                        console.log('Registered letters:', this.letters);
                        
                        // Add the tool call and result to the messages
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: "registerLetters",
                            content: JSON.stringify({ success: true, letters: this.letters })
                        });
                    } else if (toolCall.function.name === 'addOpponentWord') {
                        // Parse the function arguments
                        const functionArgs = JSON.parse(toolCall.function.arguments);
                        
                        // Process letters (e.g., store them for validation)
                        console.log('add Opponent word:', functionArgs.oppoenentWord);

                        this.usedWords.push(functionArgs.oppoenentWord);
                        
                        // Add the tool call and result to the messages
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            name: "addOpponentWord",
                            content: JSON.stringify({ success: true, word: functionArgs.oppoenentWord })
                        });
                    }
                }

                continue;
            }


            const result = completion.choices[0].message.content ? completion.choices[0].message.content.trim() : "";
            
            
            if (!this.letters) {
                messages.push({ role: "user", content: "Letters not registered"});
                console.log('Letters not registered', 'last result:', result);
            } else if (this.usedWords.includes(result)){
                messages.push({ role: "user", content: "Try again, the word is used." });
                console.log('Try again, the word is used.', 'last result:', result);
            } else if (!/^\[[a-z]+\]$/.test(result)) {
                messages.push({ role: "user", content: "Try again, the word is invalid format. MUST be [<word>]" });
                console.log('Try again, the word is invalid format. MUST be [<word>]', 'last result:', result);
            } else if (this.letters && !result.slice(1, -1).split('').every(letter => this.letters.includes(letter))) {
                messages.push({ role: "user", content: `Try again, the word contains letters not in the allowed set.: ${this.letters}` });
                console.log(`Try again, the word contains letters not in the allowed set.: ${this.letters}`, 'last result:', result);
            } else if (this.usedWords.some(w => w.length > result.length)) {
                const longestUsedWord = Math.max(...this.usedWords.map(w => w.length)) - 2;
                messages.push({ role: "user", content: `Try again, word needs to be longer than: ${longestUsedWord}` });
                console.log(`Try again, word needs to be longer than: ${longestUsedWord}`, 'last result:', result);
            } else {
                word = result;
                this.usedWords.push(word);

                break;
            }
        }

        return word;
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
