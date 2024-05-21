// ===================
// == Queue Handler ==
// ===================
// This file contains the queue handler for LLaMA.
// It sets up the queue and the queue handler, and
// exports the queue for use in other files.

// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from 'redis';
import bullmqPkg from 'bullmq';
const { Queue, Worker } = bullmqPkg;
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { fetchChatCompletion, fetchBedrockChatCompletion } from './llm-api.js';
import { addToCollection, deleteFromCollection } from './chroma.js';
import { embedText } from './embedding.js';
import { toBoolean, generateGUID, delay } from './utils.js';

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_USER = process.env.REDIS_USER || "default";
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || "";
const COMPLETED_JOB_CLEANUP_DELAY = parseInt(process.env.COMPLETED_JOB_CLEANUP_DELAY) || 1000 * 60 * 5;
const VERBOSE_LOGGING = toBoolean(process.env.VERBOSE_LOGGING) || false;
const LLM_BEDROCK = toBoolean(process.env.LLM_BEDROCK) || false;


// -------------------------
// -- Heartbeat for Redis --
// -------------------------
export async function redisHeartbeat() {
    try {
        const redisClient = createClient({
            url: `redis://${REDIS_USER}:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}`
        });
        await redisClient.connect();
        console.log(`(ツ) → Redis Online → ${REDIS_HOST}:${REDIS_PORT}`);
        await redisClient.disconnect();
    } catch (error) {
        console.log(`X → Redis Offline: ${error}`);
        console.log(`  redis://${REDIS_HOST}:${REDIS_PORT}`);
        process.exit(1); // Exit the process with an error code
    }
}


// ---------------------------
// -- Create a BullMQ queue --
// ---------------------------
const llamaQueue = new Queue('llama-requests', { connection: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    username: REDIS_USER,
    password: REDIS_PASSWORD
}});


// ----------------------------------------------
// -- make the queue available by returning it --
// ----------------------------------------------
export function setupLlamaQueue() {
    return llamaQueue;
}


// --------------------------------------
// -- setup the queue handler routines --
// --------------------------------------
// This function sets up the queue handler routines
// (dashboard, queue processing, and cleanup)
export function setupQueueHandler(app, responseStreams, INACTIVE_THRESHOLD, ACTIVE_CLIENTS, CHUNK_TOKEN_SIZE, CHUNK_TOKEN_OVERLAP, total_slots) {

    // -----------------------
    // -- Set up Bull Board --
    // -----------------------
    const bullBoardAdapter = new BullMQAdapter(llamaQueue);
    const serverAdapter = new ExpressAdapter();
    createBullBoard({
        queues: [bullBoardAdapter],
        serverAdapter: serverAdapter,
    });
    serverAdapter.setBasePath('/admin/queues');
    app.use('/admin/queues', serverAdapter.getRouter());


    // ------------------------------------------------
    // -- Process queue with limited concurrent jobs --
    // ------------------------------------------------
    const worker = new Worker('llama-requests', async (job) => {
        // Check if the job was flagged as inactive
        if (job.data.clientNotActive) {
            console.log(`Skipping inactive job: ${job.id}`);
            return;
        }
        
        const { requestId } = job.data;
        const res = responseStreams.get(requestId);
        if (!res) return; // If response stream is not found, skip processing
        
        try {
            await streamLlamaData(job.data.fullPrompt, res, job, ACTIVE_CLIENTS, CHUNK_TOKEN_SIZE, CHUNK_TOKEN_OVERLAP); // Pass the entire job object
            responseStreams.delete(requestId); // Clean up after streaming
        } catch (error) {
            console.log(`Error streaming data: ${job.id}`);
            // console.log('Error streaming data:', error);

            if (error.message.includes('slot unavailable')) {
                await handleSlotUnavailableError(job); // Pass the entire job object here
            }
        }
    }, { 
        connection: {
            host: REDIS_HOST,
            port: REDIS_PORT,
            username: REDIS_USER,
            password: REDIS_PASSWORD
        },
        concurrency: total_slots
    });


    // ------------------------------------------
    // -- Cleanup routine for inactive clients --
    // ------------------------------------------
    setInterval(async () => {
        const queuedJobs = await llamaQueue.getJobs(['waiting']);

        for (let job of queuedJobs) {
            if (!ACTIVE_CLIENTS.has(job.data.requestId) && !job.data.clientNotActive) {
                job.data.clientNotActive = true;

                try {
                    await job.remove(); // Remove the job from the queue
                    console.log(`Flagged job as inactive: ${job.id}`);
                } catch (error) {   
                    console.log(`Error flagging job as inactive: ${job.id}`);
                }
            }
        }
    }, INACTIVE_THRESHOLD);


    // ----------------------------------------
    // -- Cleanup routine for completed jobs --
    // ----------------------------------------
    setInterval(async () => {
        const completedJobs = await llamaQueue.getJobs(['completed']);
        const timeDelay = Date.now() - COMPLETED_JOB_CLEANUP_DELAY;

        for (let job of completedJobs) {
            if (job.finishedOn && job.finishedOn < timeDelay) {
                await job.remove();
                if (VERBOSE_LOGGING) { console.log(`Removed completed job: ${job.id}`); }

                try {
                    await job.remove(); // Remove the job from the queue
                    if (VERBOSE_LOGGING) { console.log(`Removed completed job: ${job.id}`); }
                } catch (error) {   
                    console.log(`Error removing completed job: ${job.id}`);
                }
            }
        }
    }, COMPLETED_JOB_CLEANUP_DELAY);
}


// --------------------------------------
// -- Handle "slot unavailable" errors --
// --------------------------------------
async function handleSlotUnavailableError(job) {
    const jobId = job.id;
    if (VERBOSE_LOGGING) { console.warn('slot unavailable, retrying job:', jobId); }

    try {
        await delay(2000); // Delay before retrying

        // Generate a new unique job ID for retry
        const retryJobId = `retry-${jobId}-${Date.now()}`;
        if (VERBOSE_LOGGING) { console.log('Retrying job with new ID:', retryJobId); }

        // Remove the original job from the queue
        await job.remove()
            .catch(async error => {
                console.log(`Error removing job: ${job.id}`);
        });
        
        // remove failed job from Chroma
        await deleteFromCollection(job.opts.collectionName, job.opts.promptGUID);
        
        // Re-add the job with the same data and the new job ID
        await llamaQueue.add('chat-retry', job.data, { jobId: retryJobId, delay: 2000 });
    } catch (retryError) {
        console.log('Error retrying job:', retryError, 'Original job ID:', jobId);
    }
}


// -----------------------------------
// -- Stream LLaMA data to response --
// -----------------------------------
export async function streamLlamaData(prompt, res, job, ACTIVE_CLIENTS, CHUNK_TOKEN_SIZE, CHUNK_TOKEN_OVERLAP) {
    try {
        let collectionName = job.opts.collectionName;
        let jobName = job.name;
        let fullResponse = ''; // Store the full response in memory for embedding
        
        // create a short prompt for logging
        const lastPrompt = prompt[prompt.length - 1].content;
        const shortPrompt = lastPrompt.slice(-70);

        console.log(`→ → → starting response to: ...${shortPrompt}`);

        // Stream the data to the response
        if (LLM_BEDROCK) {
            for await (const chunk of fetchBedrockChatCompletion(prompt)) {
                let content = chunk;

                res.write(`${content}`);
                fullResponse += content; // Append the chunk to the full response
            }
        } else {
            for await (const chunk of fetchChatCompletion(prompt)) {
                let content = chunk;

                res.write(`${content}`);
                fullResponse += content; // Append the chunk to the full response
            }
        }

        // Embed the full response
        const textChunksAndEmbeddings = await embedText(fullResponse, CHUNK_TOKEN_SIZE, CHUNK_TOKEN_OVERLAP).catch(console.log);

        for (const textChunksAndEmbedding of textChunksAndEmbeddings) {
            // add each chunk to the collection
            addToCollection(
                collectionName,
                generateGUID(),
                textChunksAndEmbedding.embedding,
                { source: "assistant", tokenCount: textChunksAndEmbedding.tokenCount, dateAdded: Date.now() },
                textChunksAndEmbedding.text,
            ).catch(error => {
                console.log('Error adding to collection:', error);
            });
        }

        ACTIVE_CLIENTS.delete(job.id); // Remove the client from the active list
        console.log(`← ← ← ended response to: ...${shortPrompt}`);
    } catch (error) {
        if (error.message.includes('slot unavailable')) {
            await handleSlotUnavailableError(job); // Use job here
        } else {
            console.log('Error streaming data:', error);
            res.end('Error streaming data');
        }
    } finally {
        if (!res.writableEnded) {
            res.end();
        }
    }
}