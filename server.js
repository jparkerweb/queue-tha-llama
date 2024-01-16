// =============================
// == Server file for chatbot ==
// ============================= 
// This file contains the server code for the chatbot. It uses Express to handle
// HTTP requests and Bull to handle the queue. It also uses Bull Board to provide
// a dashboard for the queue. The chatbot uses the llama function from completion.js
// to generate text based on the prompt provided by the client.


import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import path from 'path';

import { chromaHeartbeat } from './chroma.js';
import { setupApiRoutes } from './api-routes.js';
import { redisHeartbeat } from './queue-handler.js';
import { embeddingTest } from './embedding_test.js';
import { toBoolean } from './utils.js';

const PORT = process.env.PORT || 3001; // Port for the Express Server to listen on
const LLM_SERVER_URL = process.env.LLM_SERVER_URL || 'http://localhost:8080';
const INDEX_HTML_FILE = process.env.INDEX_HTML_FILE || 'index.html';
const RUN_STARTUP_EMBEDDING_TEST = toBoolean(process.env.RUN_STARTUP_EMBEDDING_TEST) || false;


console.log('\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n'); // Clears the console
// (ツ) → Check if LLM server is running and store n_ctx value from the LLM model.json endpoint
const n_ctx = await fetchNCtxValue();
// (ツ) → Check if Redis server is running
await redisHeartbeat();
// (ツ) → Check if Chroma server is running
await chromaHeartbeat();
// (ツ) → Run embedding test
if (RUN_STARTUP_EMBEDDING_TEST) { await embeddingTest(); }


// calculate chunk token size and overlap
const CHUNK_TOKEN_SIZE = Math.floor(n_ctx / 10);
const CHUNK_TOKEN_OVERLAP = Math.max(Math.floor(CHUNK_TOKEN_SIZE / 10), 50);


// ----------------
// -- Middleware --
// ----------------
// set up Express and HTTP server
const app = express();
const server = http.createServer(app);
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: INDEX_HTML_FILE }));


// -----------------------
// -- Set up API routes --
// -----------------------
// This function sets up the API routes for the server
setupApiRoutes(app, CHUNK_TOKEN_SIZE, CHUNK_TOKEN_OVERLAP);


// --------------------------------------------------------------------
// -- Function to fetch n_ctx value from the LLM model.json endpoint --
// --------------------------------------------------------------------
async function fetchNCtxValue() {
    try {
        const response = await fetch(`${LLM_SERVER_URL}/model.json`);
        if (!response.ok) {
            console.error(`X → LLM Server Offline\nError fetching model.json: ${response.statusText}`);
            process.exit(1); // Exit the process with an error code
        } else {
            console.log('(ツ) → LLM Server Online');
        }
        const data = await response.json();
        return data.n_ctx;
    } catch (error) {
        console.error('X → LLM Server Offline\nError fetching n_ctx value:', error);
        process.exit(1); // Exit the process with an error code
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