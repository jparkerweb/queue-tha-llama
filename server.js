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
const MAX_CONCURRENT_REQUESTS = 2;
const REDIS_URL = "redis://127.0.0.1:6379";

// Create a Bull queue
const llamaQueue = new Queue('llama-requests', `${REDIS_URL}`);

// Set up Bull Board
const { router } = createBullBoard([new BullAdapter(llamaQueue)]);
app.use('/admin/queues', router);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Active job count to manage concurrent streaming
let activeJobs = 0;

// Process queue with limited concurrent jobs
llamaQueue.process(MAX_CONCURRENT_REQUESTS, async (job) => {
    activeJobs++;
    try {
        // Perform LLaMA processing without streaming
        const responseContent = await getLlamaResponse(job.data.prompt);
        // Store response content or handle it as needed
    } finally {
        activeJobs--;
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

    if (activeJobs < MAX_CONCURRENT_REQUESTS) {
        activeJobs++;
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        streamLlamaData(prompt, res);
    } else {
        // Do not pass the res object to the Bull queue
        const job = await llamaQueue.add({ prompt });
        res.status(202).json({ jobId: job.id });
    }
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Redis dashboard running on http://localhost:3000/admin/queues`);
});
