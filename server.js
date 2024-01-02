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
import bullmqPkg from 'bullmq';
const { Queue, Worker } = bullmqPkg;
import path from 'path';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { llama } from './completion.js';

const app = express();
const server = http.createServer(app);

// ---------------------------
// -- environment variables --
// ---------------------------
const PORT = process.env.PORT || 3001;
const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const MAX_CONCURRENT_REQUESTS = parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 2;
const COMPLETED_JOB_CLEANUP_DELAY = parseInt(process.env.COMPLETED_JOB_CLEANUP_DELAY) || 1000 * 60 * 5;
const INACTIVE_THRESHOLD = parseInt(process.env.INACTIVE_THRESHOLD) || 1000 * 5;
const ACTIVE_CLIENTS = new Map();


// Store response streams by requestId
const responseStreams = new Map();


// Middleware
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


// Create a BullMQ queue
const llamaQueue = new Queue('llama-requests', { connection: {
    host: REDIS_HOST,
    port: REDIS_PORT
}});


// Set up Bull Board
const bullBoardAdapter = new BullMQAdapter(llamaQueue);
const serverAdapter = new ExpressAdapter();
createBullBoard({
    queues: [bullBoardAdapter],
    serverAdapter: serverAdapter,
});
serverAdapter.setBasePath('/admin/queues');
app.use('/admin/queues', serverAdapter.getRouter());


// Process queue with limited concurrent jobs
const worker = new Worker('llama-requests', async (job) => {
    // Check if the job was flagged as inactive
    if (job.data.clientNotActive) {
        console.log(`Skipping inactive job: ${job.id}`);
        // You can directly complete the job here or perform any cleanup needed
        return;
    }
    
    const { requestId } = job.data;
    const res = responseStreams.get(requestId);
    if (!res) return; // If response stream is not found, skip processing
    
    try {
        await streamLlamaData(job.data.prompt, res, job); // Pass the entire job object
        responseStreams.delete(requestId); // Clean up after streaming
    } catch (error) {
        console.error('Error streaming data:', error);
        if (error.message.includes('slot unavailable')) {
            await handleSlotUnavailableError(job); // Pass the entire job object here
        }
    }
}, { 
    connection: {
        host: REDIS_HOST,
        port: REDIS_PORT
    },
    concurrency: MAX_CONCURRENT_REQUESTS
});


// Handle "slot unavailable" errors
async function handleSlotUnavailableError(job) {
    const jobId = job.id;
    console.warn('slot unavailable, retrying job:', jobId);
    try {
        await delay(2000); // Delay before retrying

        // Generate a new unique job ID for retry
        const retryJobId = `retry-${jobId}-${Date.now()}`;
        console.log('Retrying job with new ID:', retryJobId);

        // Re-add the job with the same data and the new job ID
        await job.remove(); // Remove the original job from the queue
        await llamaQueue.add('chat-retry', job.data, { jobId: retryJobId, delay: 2000 });
    } catch (retryError) {
        console.error('Error retrying job:', retryError, 'Original job ID:', jobId);
    }
}


// Stream LLaMA data to response
async function streamLlamaData(prompt, res, job) {
    try {
        const shortPrompt = prompt.slice(0, 40); // short prompt for logging
        console.log(`→ → → starting response to: ${shortPrompt}...`);

        // Stream the data to the response
        for await (const chunk of llama(prompt)) {
            res.write(`${chunk.data.content}`);
        }

        ACTIVE_CLIENTS.delete(job.id); // Remove the client from the active list
        console.log(`← ← ← ended response to: ${shortPrompt}...`);
    } catch (error) {
        if (error.message.includes('slot unavailable')) {
            await handleSlotUnavailableError(job); // Use job here
        } else {
            console.error('Error streaming data:', error);
            res.end('Error streaming data');
        }
    } finally {
        if (!res.writableEnded) {
            res.end();
        }
    }
}


// Endpoint to get heartbeat interval
app.get('/heartbeat-interval', (req, res) => {
    res.json({ heartbeatInterval: INACTIVE_THRESHOLD / 2 });
});


// Endpoint to handle chat messages
app.post('/chat', async (req, res) => {
    let { prompt, requestId } = req.body;

    // Ensure prompt and requestId are strings
    prompt = String(prompt);
    requestId = String(requestId);

    try {
        const job = await llamaQueue.add('chat', { prompt, requestId }, { jobId: requestId });
        console.log('Added job with ID:', job.id); // Log the job ID

        // Initialize the entry for this client in ACTIVE_CLIENTS
        ACTIVE_CLIENTS.set(requestId, null);

        // Store the response stream to be used when the job is processed
        responseStreams.set(requestId, res);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
    } catch (error) {
        console.error('Error adding job to queue:', error);
        res.status(500).send('Error adding job to queue');
    }
});


// Endpoint to handle heartbeats
app.post('/heartbeat', (req, res) => {
    const { requestId } = req.body;

    if (requestId) {
        // Clear any existing timeout for this client
        const existingTimeout = ACTIVE_CLIENTS.get(requestId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        // Set a new timeout for this client
        const timeoutId = setTimeout(() => {
            if (ACTIVE_CLIENTS.has(requestId)) { // Check if the client is still active
                ACTIVE_CLIENTS.delete(requestId);
                console.log(`Removed inactive client: ${requestId}`);
            }
        }, INACTIVE_THRESHOLD);

        // Store the new timeout ID
        ACTIVE_CLIENTS.set(requestId, timeoutId);
    }
    
    // console.log(`Heartbeat received for ${requestId}`);
    res.status(200).send(`Heartbeat received for ${requestId}`);
});


// Cleanup routine for inactive clients
setInterval(async () => {
    const queuedJobs = await llamaQueue.getJobs(['waiting']);

    for (let job of queuedJobs) {
        if (!ACTIVE_CLIENTS.has(job.data.requestId) && !job.data.clientNotActive) {
            // Add a flag to indicate that the client is not active
            job.data.clientNotActive = true;
            // await job.update(job.data);
            await job.remove(); // Remove the job from the queue
            console.log(`Flagged job as inactive: ${job.id}`);
        }
    }
}, INACTIVE_THRESHOLD);


// Cleanup routine for completed jobs
setInterval(async () => {
    const completedJobs = await llamaQueue.getJobs(['completed']);
    const timeDelay = Date.now() - COMPLETED_JOB_CLEANUP_DELAY;

    for (let job of completedJobs) {
        if (job.finishedOn && job.finishedOn < timeDelay) {
            await job.remove();
            console.log(`Removed completed job: ${job.id}`);
        }
    }
}, COMPLETED_JOB_CLEANUP_DELAY);


// delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// Start the server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Redis dashboard running on http://localhost:${PORT}/admin/queues`);
});