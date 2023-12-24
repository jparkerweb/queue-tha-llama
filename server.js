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

// Process queue
llamaQueue.process(async (job) => {
    const res = responseStreams.get(job.id);
    if (res) {
        await streamLlamaData(job.data.prompt, res);
        responseStreams.delete(job.id); // Clean up after streaming
    }
});

// Stream LLaMA data to response
async function streamLlamaData(prompt, res) {
    try {
        for await (const chunk of llama(prompt)) {
            res.write(`${chunk.data.content}`);
            console.log(chunk.data.content);
        }
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
