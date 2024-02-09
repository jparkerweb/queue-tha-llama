import { promises as fs } from 'fs';
import dotenv from "dotenv";
dotenv.config();

import { delay, generateGUID, toBoolean } from './utils.js';
import { embedText } from './embedding.js';
import {
    createCollection, addToCollection,
    collectionExists, deleteCollection,
    queryCollectionEmbeddings
} from './chroma.js';

const USE_SEMANTIC_ROUTES = toBoolean(process.env.USE_SEMANTIC_ROUTES) || false;
const TOP_SEMANTIC_ROUTES = parseInt(process.env.TOP_SEMANTIC_ROUTES) || 10;
const SEMANTIC_ROUTE_SENSITIVITY = parseInt(process.env.SEMANTIC_ROUTE_SENSITIVITY) || 5;
const VERBOSE_LOGGING = toBoolean(process.env.VERBOSE_LOGGING) || false;

// ----------------------------------------
// -- load Semantic Route Data from JSON --
// ----------------------------------------
// This function loads the semantic route data from a JSON file
async function loadSemanticRouteData() {
    try {
        const data = await fs.readFile('semantic-routes.json', 'utf8');
        return JSON.parse(data); // Parse the JSON string into an object
    } catch (error) {
        console.log('Error loading semantic route data:', error);
        throw error;
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
                        _threshold: d.distanceThreshold,
                        _function: d.action,
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


// ---------------------------------------------
// -- match Semantic Route in Vector Database --
// ---------------------------------------------
export async function matchSemanticRoute(promptEmbedding, res) {
    let routeTopic = null;
    let routePhrase = null;
    let routeFunction = null;
    let matched = false;

    if (USE_SEMANTIC_ROUTES) {
        const semanticRoutesExist = await collectionExists('semantic-routes');
        if (!semanticRoutesExist) {
            await createSemanticRoutes();
        }

        const results = await queryCollectionEmbeddings('semantic-routes', promptEmbedding, TOP_SEMANTIC_ROUTES);

        if (results) {
            // loop through results
            for (let i = 0; i < results.ids[0].length; i++) {
                const _threshold = results.metadatas[0][i]._threshold;
                const _adjustedThreshold = await adjustThreshold(_threshold, SEMANTIC_ROUTE_SENSITIVITY);
                if (VERBOSE_LOGGING) {
                    console.log(`(ツ) → Semantic Route Eval: ${results.distances[0][i]} → ${results.metadatas[0][i]._topic} adjusted threshold: ${_adjustedThreshold} (original: ${_threshold})`);
                }
                
                if (results.distances[0][i] <= _adjustedThreshold) {
                    matched = true;
                    routeTopic = results.metadatas[0][i]._topic;
                    routePhrase = results.documents[0][i];
                    routeFunction = results.metadatas[0][i]._function;
                    console.log(`(ツ) → Semantic Route Matched: ${routeTopic} → ${routePhrase}`);
                    eval(routeFunction);
                    break;
                }
            }
        }
    }

    return { matched: matched, topic: routeTopic, func: routeFunction };
}


// ----------------------------------------------------
// -- adjust threshold function based on sensitivity --
// ----------------------------------------------------
function adjustThreshold(originalThreshold, sensitivity) {
    const minSensitivity = 1;
    const maxSensitivity = 100;
    const minThreshold = 0.05;
    const maxThreshold = 1.0;

    // Adjusting the midpoint to the new sensitivity scale
    const midSensitivity = 50;
    const range = maxSensitivity - minSensitivity;

    // Calculate new threshold based on the updated sensitivity scale
    let adjustedThreshold = originalThreshold;
    if (sensitivity <= midSensitivity) {
        // Scale down towards minThreshold as sensitivity moves from midSensitivity to minSensitivity
        const scale = (originalThreshold - minThreshold) / (midSensitivity - minSensitivity);
        adjustedThreshold -= scale * (midSensitivity - sensitivity);
    } else {
        // Scale up towards maxThreshold as sensitivity moves from midSensitivity to maxSensitivity
        const scale = (maxThreshold - originalThreshold) / (maxSensitivity - midSensitivity);
        adjustedThreshold += scale * (sensitivity - midSensitivity);
    }

    // Ensure adjustedThreshold is within bounds
    adjustedThreshold = Math.max(minThreshold, Math.min(maxThreshold, adjustedThreshold));

    return adjustedThreshold;
}



// =============================
// == dynamic route functions ==
// =============================

// -----------------------------------------------------------
// -- function to reply to the client with pre-defined text --
// -----------------------------------------------------------
async function reply(text, res) {
    // Split text into words, keeping punctuation attached to the preceding word
    const words = text.match(/[\w'’"-]+|[.,!?;:]/g) || [text];

    for (let i = 0; i < words.length; i++) {
        await delay(200);
        let word = words[i];
        res.write(word);
        
        // Add a space after the word if the next word is not punctuation
        if (i + 1 < words.length && !/^[.,!?;:]$/.test(words[i + 1])) {
            res.write(" ");
        }
    }

    res.end();
}
