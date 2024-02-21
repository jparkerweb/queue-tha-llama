// ==================================================================
// == Description: This file contains the code to                  == 
// == generate embeddings from text using transformers.js library. ==
// ==================================================================
// example ⇢ embedText(`some text you want to embed`, 3, 1).catch(console.error);

// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { env, pipeline, AutoTokenizer } from '@xenova/transformers';
import { toBoolean } from './utils.js';

env.localModelPath = 'models/';
env.allowRemoteModels = false;
const ONNX_EMBEDDING_MODEL = process.env.ONNX_EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
const ONNX_EMBEDDING_MODEL_QUANTIZED = toBoolean(process.env.ONNX_EMBEDDING_MODEL_QUANTIZED) || false;
const VERBOSE_LOGGING = toBoolean(process.env.VERBOSE_LOGGING) || false;

// ---------------------------------------------
// -- Function to create embeddings from text --
// ---------------------------------------------
export async function embedText(largeText, maxChunkTokenCount = 150, chunkOverlap = 10) {
    if (VERBOSE_LOGGING) {
        console.log(`embedding text with maxChunkTokenCount: ${maxChunkTokenCount}, chunkOverlap: ${chunkOverlap}`);
        console.log(`using model: ${ONNX_EMBEDDING_MODEL}`);
    }
    
    // Ensure chunkOverlap is less than maxChunkTokenCount
    if (chunkOverlap >= maxChunkTokenCount) {
        chunkOverlap = maxChunkTokenCount - 1;
    }

    const textChunks = await chunkText(largeText, maxChunkTokenCount, chunkOverlap);
    let combinedResults = [];

    for (const textChunk of textChunks) {
        if (VERBOSE_LOGGING) { console.log(`Processing chunk: ${textChunk}`); }
        try {
            const text = textChunk.chunk;
            let embedding = await createEmbedding(textChunk.chunk);
            const tokenCount = textChunk.tokenCount;
            
            // Convert chunkEmbedding to a regular array if it's not already
            embedding = Array.isArray(embedding) ? embedding : Array.from(embedding);
            
            combinedResults.push({ text, embedding, tokenCount });
            if (VERBOSE_LOGGING) { 
               console.log(`text chunk: ${textChunk.chunk}`);
               console.log(`token count: ${textChunk.tokenCount}`);
            }
        } catch (error) {
            console.error('Error creating embedding:', error);
        }
    }

    return combinedResults;
}


// ------------------------------------------------
// -- Function to chunk text into smaller pieces --
// ------------------------------------------------
async function chunkText(text, maxTokens = 150, overlap = 10) {
    const tokenizer = await AutoTokenizer.from_pretrained(ONNX_EMBEDDING_MODEL);
    const sentences = text.match(/[^.!?]+[.!?]+|\s*\n\s*/g) || [text]; // Split by sentences or new lines

    let chunks = [];
    let currentChunk = [];
    let currentTokenCount = 0;
    let overlapBuffer = [];
    let overlapTokenCount = 0;

    for (const sentence of sentences) {
        const { input_ids } = await tokenizer(sentence);
        const sentenceTokenCount = input_ids.size;

        if (currentTokenCount + sentenceTokenCount > maxTokens) {
            // Save the current chunk
            chunks.push(currentChunk.join(" "));
            // Reset the current chunk
            currentChunk = [];
            currentTokenCount = 0;
            // If overlap is used, adjust currentChunk and overlapBuffer
            if (overlap > 0) {
                currentChunk = [...overlapBuffer];
                currentTokenCount = overlapTokenCount;
            }
        }

        // Manage overlap buffer if overlap is used
        if (overlap > 0) {
            overlapBuffer.push(sentence);
            overlapTokenCount += sentenceTokenCount;

            // Adjust overlap buffer to maintain desired token count
            while (overlapBuffer.length > 1 && overlapTokenCount > overlap) {
                overlapTokenCount -= (await tokenizer(overlapBuffer.shift())).input_ids.size;
            }
        }

        // Add sentence to the current chunk
        currentChunk.push(sentence);
        currentTokenCount += sentenceTokenCount;
    }

    // Add the last chunk if not empty
    if (currentChunk.length) {
        chunks.push(currentChunk.join(" "));
    }

    return chunks.map(chunk => ({ chunk, tokenCount: tokenizer(chunk).input_ids.size }));
}


// -----------------------------------
// -- Create the embedding pipeline --
// -----------------------------------
const generateEmbedding = await pipeline('feature-extraction', ONNX_EMBEDDING_MODEL, {
    quantized: ONNX_EMBEDDING_MODEL_QUANTIZED,
});


// -------------------------------------
// -- Function to generate embeddings --
// -------------------------------------
async function createEmbedding(text) {
    const embeddings = await generateEmbedding(text, {
        pooling: 'mean',
        normalize: true,
    });

    return embeddings.data;
}
