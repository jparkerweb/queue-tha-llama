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
const COMPLETED_JOB_CLEANUP_DELAY = 1000 * 60 * 10; // how often to check for completed jobs to clean up (ms)
const INACTIVE_THRESHOLD = 5000; // Inactivity threshold (no heartbeats for this time)
const ACTIVE_CLIENTS = new Set(); // Set to store active client IDs


// Create a Bull queue
const llamaQueue = new Queue('llama-requests', REDIS_URL);

// Set up Bull Board
const { router } = createBullBoard([new BullAdapter(llamaQueue)]);
app.use('/admin/queues', router);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store response streams by requestId
const responseStreams = new Map();

// Process queue with limited concurrent jobs
llamaQueue.process(MAX_CONCURRENT_REQUESTS, async (job) => {
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
        console.error('Error message:', error.message);
        if (error.message.includes('slot unavailable')) {
            await handleSlotUnavailableError(job); // Pass the entire job object here
        }
    }
});

// Handle "slot unavailable" errors
async function handleSlotUnavailableError(job) {
    const jobId = job.id;
    console.warn('slot unavailable, retrying job:', jobId);
    try {
        await delay(1000); // Delay before retrying

        // Generate a new unique job ID for retry
        const retryJobId = `retry-${jobId}-${Date.now()}`;
        console.log('Retrying job with new ID:', retryJobId);

        // Re-add the job with the same data and the new job ID
        await llamaQueue.add(job.data, { jobId: retryJobId, delay: 1000 });
    } catch (retryError) {
        console.error('Error retrying job:', retryError, 'Original job ID:', jobId);
    }
}

// Stream LLaMA data to response
async function streamLlamaData(prompt, res, jobId) {
    try {
        console.log(`⇢ starting response to: ${prompt}`);
        for await (const chunk of llama(prompt)) {
            res.write(`${chunk.data.content}`);
        }
        console.log(`⇠ ended response to: ${prompt}`);
    } catch (error) {
        console.error('error:', error);
        if (error.message.includes('slot unavailable')) {
            await handleSlotUnavailableError(jobId); // Use jobId here
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

// Endpoint to handle chat messages
app.post('/chat', async (req, res) => {
    const { prompt, requestId } = req.body;
    try {
        const job = await llamaQueue.add({ prompt, requestId }, { jobId: requestId });
        console.log('Added job with ID:', job.id); // Log the job ID

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
    // Add the request ID to the set of active clients
    if (requestId) {
        ACTIVE_CLIENTS.add(requestId);
        //
        setTimeout(() => ACTIVE_CLIENTS.delete(requestId), INACTIVE_THRESHOLD);
    }
    res.sendStatus(204);
});

// Flagging a job as inactive
setInterval(async () => {
    const queuedJobs = await llamaQueue.getJobs(['waiting']);

    for (let job of queuedJobs) {
        if (!ACTIVE_CLIENTS.has(job.data.requestId) && !job.data.clientNotActive) {
            // Add a flag to indicate that the client is not active
            job.data.clientNotActive = true;
            await job.update(job.data);
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

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Redis dashboard running on http://localhost:${PORT}/admin/queues`);
});
