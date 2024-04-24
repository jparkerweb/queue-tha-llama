// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

const LLM_SERVER_TEMPERATURE = parseFloat(process.env.LLM_SERVER_TEMPERATURE);
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL;
const LLM_SERVER_STOP_TOKENS = JSON.parse(process.env.LLM_SERVER_STOP_TOKENS);
const LLM_MAX_RESPONSE_TOKENS = parseInt(process.env.LLM_MAX_RESPONSE_TOKENS);

// ---------------------------
// -- Import the OpenAI API --
// ---------------------------
import OpenAI from 'openai';


// ---------------------------------------------------
// -- Function to fetch the completion from the LLM --
// ---------------------------------------------------
export async function* fetchChatCompletion(prompt) {
    const openai = new OpenAI({
        baseURL: LLM_BASE_URL,
        apiKey: LLM_API_KEY,
    });

    if (typeof prompt === 'string') {
        prompt = JSON.parse(prompt);
    }

    const chatCompletion = await openai.chat.completions.create({
        messages: prompt,
        model: LLM_MODEL,
        max_tokens: LLM_MAX_RESPONSE_TOKENS,
        stop: LLM_SERVER_STOP_TOKENS,
        temperature: LLM_SERVER_TEMPERATURE,
        top_p: 0.7,
        stream: true,
    })
    for await (const chunk of chatCompletion) {
        const tokenText = chunk.choices[0]?.delta?.content || "";
        // yield the token text to the client
        yield tokenText;
    }
}
