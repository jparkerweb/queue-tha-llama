// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

const LLM_SERVER_TEMPERATURE = parseFloat(process.env.LLM_SERVER_TEMPERATURE);
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL;
const LLM_SERVER_STOP_TOKENS = JSON.parse(process.env.LLM_SERVER_STOP_TOKENS);
const LLM_MAX_RESPONSE_TOKENS = parseInt(process.env.LLM_MAX_RESPONSE_TOKENS);
const LLM_BEDROCK_REGION = process.env.LLM_BEDROCK_REGION;
const LLM_BEDROCK_ACCESS_KEY_ID = process.env.LLM_BEDROCK_ACCESS_KEY_ID;
const LLM_BEDROCK_SECRET_ACCESS_KEY = process.env.LLM_BEDROCK_SECRET_ACCESS_KEY;


// -------------------------
// -- Import the LLM APIs --
// -------------------------
import OpenAI from 'openai';
import { bedrockWrapper } from "bedrock-wrapper";


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
    let stop = LLM_SERVER_STOP_TOKENS;
    if (typeof stop === 'string') {
        stop = JSON.parse(stop);
    }

    const chatCompletion = await openai.chat.completions.create({
        messages: prompt,
        model: LLM_MODEL,
        max_tokens: LLM_MAX_RESPONSE_TOKENS,
        stop: stop,
        temperature: LLM_SERVER_TEMPERATURE,
        top_p: 0.7,
        stream: true,
    })
    for await (const chunk of chatCompletion) {
        const tokenText = chunk.choices[0]?.delta?.content || "";
        // yield the token text to the client
        if (tokenText !== '') { yield tokenText; }
    }
}

// -----------------------------------------------------------
// -- Function to fetch the completion from the Bedrock LLM --
// -----------------------------------------------------------
export async function* fetchBedrockChatCompletion(prompt) {
    console.log("fetchBedrockChatCompletion");
    if (typeof prompt === 'string') {
        prompt = JSON.parse(prompt);
    }

    const awsCreds = {
        region: LLM_BEDROCK_REGION,
        accessKeyId: LLM_BEDROCK_ACCESS_KEY_ID,
        secretAccessKey: LLM_BEDROCK_SECRET_ACCESS_KEY,
    };

    const openaiChatCompletionsCreateObject = {
        "messages": prompt,
        "model": LLM_MODEL,
        "max_tokens": LLM_MAX_RESPONSE_TOKENS,
        "stream": true,
        "temperature": LLM_SERVER_TEMPERATURE,
        "top_p": 0.7,
    };


    // invoke the streamed bedrock api response
    for await (const chunk of bedrockWrapper(awsCreds, openaiChatCompletionsCreateObject)) {
        // yield the token text to the client
        if (chunk !== '') { yield chunk; }
    }
}
