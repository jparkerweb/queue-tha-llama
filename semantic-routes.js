import { promises as fs } from 'fs';
import dotenv from "dotenv";
dotenv.config();

import { generateGUID } from './utils.js';
import { embedText } from './embedding.js';
import { createCollection, addToCollection, deleteCollection } from './chroma.js';

const SEMATIC_ROUTE_MIN_SCORE = parseFloat(process.env.SEMATIC_ROUTE_MIN_SCORE) || 0.3;
console.log(`(ツ) → SEMATIC_ROUTE_MIN_SCORE value: ${SEMATIC_ROUTE_MIN_SCORE}`);

// ----------------------------------------
// -- load Semantic Route Data from JSON --
// ----------------------------------------
// This function loads the semantic route data from a JSON file
async function loadSemanticRouteData() {
    try {
        // Use fs.readFile to read the file content
        const data = await fs.readFile('semantic-routes.json', 'utf8');
        return JSON.parse(data); // Parse the JSON string into an object
    } catch (error) {
        console.error('Error loading semantic route data:', error);
        throw error; // Rethrow the error to handle it in the calling function
    }
}


// -----------------------------------------------
// -- create Semantic Routes in Vector Database --
// -----------------------------------------------
export async function createSemanticRoutes() {
    // Create a collection if it doesn't already exist
    const collectionName = 'semantic-routes';
    await deleteCollection(collectionName);
    await createCollection(collectionName);
    const data = await loadSemanticRouteData();

    // loop through data
    for (const d of data) {
        for (const phrase of d.phrases) {
            const embeddingResults = await embedText(phrase, 512, 0);

            // Add the embedding to the collection
            for (const embeddingResult of embeddingResults) {
                const { text, embedding, tokenCount } = embeddingResult;
                const id = generateGUID();

                await addToCollection(
                    collectionName,
                    id,
                    embedding,
                    {
                        _topic: d.topic,
                        _function: d.function,
                        source: "semantic-routes",
                        tokenCount: tokenCount,
                        dateAdded: new Date().toISOString(),
                    },
                    text
                ).then(async () => {
                    console.log(`Added semantic route for: ${d.topic} → ${text}`);
                });
            }
        }
    }
    console.log('(ツ) → Semantic routes created');
}