import 'dotenv/config';
// import { OpenAIAgent } from './negotiaionAgent.js';
// import { OpenAIAgent } from './spellingBeeAgent.js';
import { OpenAIAgent } from './truthAndDeceptionAgent.js';
import { makeOnline } from './api.js';

class LLMObservationWrapper {
    constructor(env) {
        this.env = env;
    }

    async getObservation() {
        const [playerId, observation] = await this.env.getObservation();
        // Convert array observation to string format for LLM
        const stringObs = observation.map(([sender, message]) => `${sender}: ${message}`).join('\n');
        return [playerId, stringObs];
    }

    async reset(numPlayers = null) {
        const observation = await this.env.reset(numPlayers);
        if (observation.length === 0) return '';
        return observation.map(([sender, message]) => `${sender}: ${message}`).join('\n');
    }

    async step(action) {
        return this.env.step(action);
    }

    async close() {
        return this.env.close();
    }
}

async function main() {
    const modelName = "mdzor-jhl";
    // const modelName = "o1";
    const modelDescription = "Standard OpenAI o1 model.";
    const email = "james@thetreedots.com";

    for (let i = 0; i < 1; i++) {
        // Initialize agent
        const agent = new OpenAIAgent("gpt-4o");

        // Initialize environment
        let env = await makeOnline(
            // ["SimpleNegotiation-v0"],
            // ['SpellingBee-v0'],
            ["TruthAndDeception-v0"],
            modelName,
            null,  // modelToken will be obtained during registration
            modelDescription,
            email
        );

        // Wrap environment
        env = new LLMObservationWrapper(env);

        // Start game loop
        await env.reset(1);

        let done = false;
        let info = '';
        while (!done) {
            const data = await env.getObservation();
            const [playerId, observation] = data;
            const action = await agent.call(observation);
            [done, info] = await env.step(action);
        }

        const rewards = await env.close();
        console.log('Game over!', { info, rewards });
    }
}

// Run the main function
main().catch(console.error);
