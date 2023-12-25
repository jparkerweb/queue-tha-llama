const express = require('express');
const http = require('http');
const Queue = require('bull');
const path = require('path');
const { createBullBoard } = require('bull-board');
const { BullAdapter } = require('bull-board/bullAdapter');
const { llama } = require('./completion.js');

const app = express();
const server = http.createServer(app);
const PORT = 3000;
const MAX_CONCURRENT_REQUESTS = 2; // Reintroducing this constant
const REDIS_URL = "redis://127.0.0.1:6379";

// Create a Bull queue
const llamaQueue = new Queue('llama-requests', `${REDIS_URL}`);

// Set up Bull Board
const { router } = createBullBoard([new BullAdapter(llamaQueue)]);
app.use('/admin/queues', router);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store response streams by job ID
const responseStreams = new Map();

// Process queue with limited concurrent jobs and retry logic
llamaQueue.process(MAX_CONCURRENT_REQUESTS, async (job) => {
    const res = responseStreams.get(job.id);
    if (!res) return; // If response stream is not found, skip processing

    try {
        await streamLlamaData(job.data.prompt, res);
        responseStreams.delete(job.id); // Clean up after streaming
    } catch (error) {
        console.error('Error streaming data:', error);
        if (error.message.includes('slot unavailable')) {
            // Retry logic for 'slot unavailable' error
            await handleSlotUnavailableError(job);
        }
    }
});

async function handleSlotUnavailableError(job) {
    try {
        // Optional: implement a delay before retrying
        await delay(500);

        // Add the job back to the queue for retrying
        await llamaQueue.add(job.data, { jobId: job.id });
    } catch (retryError) {
        console.error('Error retrying job:', retryError);
    }
}

// Stream LLaMA data to response
async function streamLlamaData(prompt, res) {
    try {
        console.log(`starting response to: ${prompt}`);
        for await (const chunk of llama(prompt)) {
            res.write(`${chunk.data.content}`);
        }
        console.log(`ended response to: ${prompt}`);
    } catch (error) {
        console.error('Error streaming data:', error);
    } finally {
        res.end();
    }
}

// Endpoint to handle chat messages
app.post('/chat', async (req, res) => {
    const { prompt } = req.body;
    const job = await llamaQueue.add({ prompt });

    // Store the response stream to be used when the job is processed
    responseStreams.set(job.id, res);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Redis dashboard running on http://localhost:3000/admin/queues`);
});
