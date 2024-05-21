// =============================
// == Server file for chatbot ==
// ============================= 
// This file contains the server code for the chatbot. It uses Express to handle
// HTTP requests and Bull to handle the queue. It also uses Bull Board to provide
// a dashboard for the queue. The chatbot uses llm-api.js to generate text based
// on the prompt provided by the client. See api-routes.js for all available
// endpoints and their functionality.


// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';

import { chromaHeartbeat, cleanupOldChromaDBCollections } from './chroma.js';
import { setupApiRoutes } from './api-routes.js';
import { redisHeartbeat } from './queue-handler.js';
import { createSemanticRoutes } from './semantic-routes.js';
import { toBoolean } from './utils.js';

const PORT = process.env.PORT; // Port for the Express Server to listen on
const LLM_BASE_URL = process.env.LLM_BASE_URL;
const LLM_SERVER_API = process.env.LLM_SERVER_API;
const INDEX_HTML_FILE = process.env.INDEX_HTML_FILE;
const USE_SEMANTIC_ROUTES = toBoolean(process.env.USE_SEMANTIC_ROUTES) || false;
const MAX_CONCURRENT_REQUESTS_FALLBACK = parseInt(process.env.MAX_CONCURRENT_REQUESTS_FALLBACK, 10) || 1;
const MIN_CHUNK_TOKEN_SIZE = parseInt(process.env.MIN_CHUNK_TOKEN_SIZE, 10) || 150;
const MAX_CHUNK_TOKEN_SIZE = parseInt(process.env.MAX_CHUNK_TOKEN_SIZE, 10) || 150;
const MIN_CHUNK_TOKEN_OVERLAP = process.env.MIN_CHUNK_TOKEN_OVERLAP !== undefined ? parseInt(process.env.MIN_CHUNK_TOKEN_OVERLAP, 10) : 10;
const MAX_CHUNK_TOKEN_OVERLAP = process.env.MAX_CHUNK_TOKEN_OVERLAP !== undefined ? parseInt(process.env.MAX_CHUNK_TOKEN_OVERLAP, 10) : 10;
const LLM_CONTEXT_LENGTH = parseInt(process.env.LLM_CONTEXT_LENGTH, 10) || 2048;
const LLM_MAX_RESPONSE_TOKENS = parseInt(process.env.LLM_MAX_RESPONSE_TOKENS) || 500;


console.log('\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'); // Clears the console
// (ツ) → Check if LLM server is running and store n_ctx value from the LLM /props endpoint
const n_ctx = await fetchNCtxValue();
// (ツ) → Calculate total_slots from /props LLM server endpoint
const total_slots = await fetchLLMTotalSlots();
// (ツ) → Check if Redis server is running
await redisHeartbeat();
// (ツ) → Check if Chroma server is running
await chromaHeartbeat();
// (ツ) → Cleanup old ChromaDB collections
cleanupOldChromaDBCollections();
// (ツ) → Create semantic routes
if (USE_SEMANTIC_ROUTES) { await createSemanticRoutes(); }


// Calculate chunk token size within the specified range
let CHUNK_TOKEN_SIZE = Math.floor(n_ctx / 10);
CHUNK_TOKEN_SIZE = Math.max(MIN_CHUNK_TOKEN_SIZE, CHUNK_TOKEN_SIZE);
CHUNK_TOKEN_SIZE = Math.min(MAX_CHUNK_TOKEN_SIZE, CHUNK_TOKEN_SIZE);
console.log(`(ツ) → CHUNK_TOKEN_SIZE value: ${CHUNK_TOKEN_SIZE}`);

// Calculate chunk token overlap based on CHUNK_TOKEN_SIZE and within the specified range
let CHUNK_TOKEN_OVERLAP = Math.floor(CHUNK_TOKEN_SIZE / 10);
CHUNK_TOKEN_OVERLAP = Math.max(MIN_CHUNK_TOKEN_OVERLAP, CHUNK_TOKEN_OVERLAP);
CHUNK_TOKEN_OVERLAP = Math.min(MAX_CHUNK_TOKEN_OVERLAP, CHUNK_TOKEN_OVERLAP);
console.log(`(ツ) → CHUNK_TOKEN_OVERLAP value: ${CHUNK_TOKEN_OVERLAP}`);


// ------------------------------------
// -- set up Express and HTTP server --
// ------------------------------------
const app = express();
const server = http.createServer(app);
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: INDEX_HTML_FILE }));


// --------------------------------------------
// -- Read the package.json file app version --
// --------------------------------------------
const packageJsonPath = path.join(__dirname, 'package.json');
let appVersion = 'unknown';
fs.readFile(packageJsonPath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading package.json:', err);
  } else {
    // Parse the JSON data
    const packageJson = JSON.parse(data);
    // Store the version number
    appVersion = packageJson.version;
  }
});


// ----------------------------------------------------
// -- Create an endpoint to serve the version number --
// ----------------------------------------------------
app.get('/version', (req, res) => {
    res.json({ version: appVersion });
});


// -----------------------
// -- Set up API routes --
// -----------------------
// This function sets up the API routes for the server
setupApiRoutes(app, CHUNK_TOKEN_SIZE, CHUNK_TOKEN_OVERLAP, total_slots);


// --------------------------------------------------------------------
// -- Function to fetch n_ctx value from the LLM /props endpoint --
// --------------------------------------------------------------------
async function fetchNCtxValue() {
    try {
        if (LLM_SERVER_API === 'llama.cpp') {
            const response = await fetch(`${LLM_BASE_URL}/props`);
            if (!response.ok) {
                console.error(`X → LLM Server Offline\nError fetching /props: ${response.statusText}`);
                process.exit(1); // Exit the process with an error code
            } else {
                console.log('(ツ) → LLM Server Online');
            }
            const data = await response.json();
            return data.default_generation_settings.n_ctx;
        } else {
            return (LLM_CONTEXT_LENGTH - LLM_MAX_RESPONSE_TOKENS);
        }
    } catch (error) {
        console.error('X → LLM Server Offline\nError fetching n_ctx value:', error);
        process.exit(1); // Exit the process with an error code
    }
}


// ------------------------------------------------------------------------------
// -- Function to fetch total_slots value from the Llama.cpp "/props" endpoint --
// ------------------------------------------------------------------------------
async function fetchLLMTotalSlots() {
    try {
        let total_slots = MAX_CONCURRENT_REQUESTS_FALLBACK || 1;

        if (LLM_SERVER_API === 'llama.cpp') {

            const response = await fetch(`${LLM_BASE_URL}/props`);
            if (!response.ok) {
                console.error('X → Problem fetching "/props" endpoint from LLM Server');
                console.log(`    using fallback value MAX_CONCURRENT_REQUESTS_FALLBACK: ${MAX_CONCURRENT_REQUESTS_FALLBACK}`)
                
                return MAX_CONCURRENT_REQUESTS_FALLBACK
            }
            const data = await response.json();
            
            if (data.total_slots) total_slots = data.total_slots;
        }

        console.log(`(ツ) → LLM Server "total_slots": ${total_slots}`);
        return total_slots;
    } catch (error) {
        console.error('X → Problem fetching "total_slots" from "/props" endpoint for LLM Server', error);
        console.log(`    using fallback value MAX_CONCURRENT_REQUESTS_FALLBACK: ${MAX_CONCURRENT_REQUESTS_FALLBACK}`)
        
        return MAX_CONCURRENT_REQUESTS_FALLBACK
    }
}



// ----------------------
// -- Start the server --
// ----------------------
server.listen(PORT, () => {
    console.log('(ツ) → Express Server Online')
    console.log('\n↓↓\n')
    console.log(`↪  Express Server   →  http://localhost:${PORT}`);
    console.log(`↪  Redis dashboard  →  http://localhost:${PORT}/admin/queues`);
    console.log(`↪  Chroma dashboard →  http://localhost:${PORT}/list-collections`);
    console.log('\n')
});