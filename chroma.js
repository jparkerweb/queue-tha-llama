// ==================================
// == Description: ChromaDB client ==
// ==================================

// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { toBoolean } from './utils.js';

const CHROMA_SERVER_URL = process.env.CHROMA_SERVER_URL || "http://localhost:8001";
const CHROMA_DISTANCE_FUNCTION = process.env.CHROMA_DISTANCE_FUNCTION || "cosine";
const VERBOSE_LOGGING = toBoolean(process.env.VERBOSE_LOGGING) || false;
const CHROMADB_COLLECTION_CLEANUP_INTERVAL = parseInt(process.env.CHROMADB_COLLECTION_CLEANUP_INTERVAL)
const CHROMADB_COLLECTION_ALLOWED_AGE = parseInt(process.env.CHROMADB_COLLECTION_ALLOWED_AGE)

import { ChromaClient } from "chromadb";
const chromaClient = new ChromaClient({ path: CHROMA_SERVER_URL, });


// ---------------
// -- heartbeat --
// ---------------
// This function sends a heartbeat to the Chroma server to check if it is running.
export async function chromaHeartbeat() {
	console.info("(ツ) → Checking Chroma Vector Database...");
	console.info(`       ${CHROMA_SERVER_URL}`);

	const heartbeat = await chromaClient.heartbeat()
		.then((response) => {
			console.log("(ツ) → Chroma Vector Database Online: ", response);
			console.log(`  ${CHROMA_SERVER_URL}`);
		})
		.catch((error) => {
			console.error("X → Chroma Vector Database Offline: ", error);
			console.log(`  ${CHROMA_SERVER_URL}`);
			process.exit(1); // exit with error
		});
}


// -----------------------
// -- create collection --
// -----------------------
export async function createCollection(collectionName, description = "a collection of embeddings") {
	if (VERBOSE_LOGGING) { console.log(`→ createCollection: ${collectionName}`); }
	const collection = await chromaClient.getOrCreateCollection({
		name: collectionName,
		metadata: {
			"hnsw:space": CHROMA_DISTANCE_FUNCTION,
			description: description,
			dateCreated: new Date().toISOString(),
		},
	});
}


// -----------------------
// -- delete collection --
// -----------------------
export async function deleteCollection(collectionName) {
	if (VERBOSE_LOGGING) { console.log(`→ deleteCollection: ${collectionName}`); }
	await chromaClient.deleteCollection({
		name: collectionName,
	});
}


// -----------------------
// -- collection exists --
// -----------------------
export async function collectionExists(collectionName) {
	const collection = await chromaClient.getCollection({
		name: collectionName,
	}).then((response) => {
		return true;
	}).catch((error) => {
		return false;
	});
	return collection;
}


// -----------------------
// -- add to collection --
// -----------------------
export async function addToCollection(
	collectionName,
	ids,
	embeddings,
	metadatas,
	documents
) {
	if (VERBOSE_LOGGING) { console.log(`→ addToCollection: ${collectionName}`); }
	const collection = await chromaClient.getOrCreateCollection({
		name: collectionName,
	}).catch((error) => {
		console.log("Error getting collection: ", error);
		return;
	});

	if (VERBOSE_LOGGING) { console.log(`→ → embeddings length: ${embeddings.length}`); }

	await collection.add({
		ids: ids,
		embeddings: embeddings,
		metadatas: metadatas,
		documents: documents,
	}).then((response) => {
		if (VERBOSE_LOGGING) { console.log("✔ Added to collection"); }
		// if (VERBOSE_LOGGING) { console.log(`embeddings: ${embeddings}`); }
	}).catch((error) => {
		console.log("Error adding to collection: ", error);
	});
}


// --------------------------------------
// -- query collection with embeddings --
// --------------------------------------
export async function queryCollectionEmbeddings(
	collectionName,
	queryEmbeddings,
	nResults = 10
) {
	if (VERBOSE_LOGGING) { console.log(`→ queryCollectionEmbeddings: ${collectionName}`); }
	const collection = await chromaClient.getCollection({
		name: collectionName,
	});
	const results = await collection.query({
		queryEmbeddings: queryEmbeddings,
		nResults: nResults,
		include: ["distances", "metadatas", "embeddings", "documents"],
	});
	return results;
}


// ----------------------------
// -- delete from collection --
// ----------------------------
export async function deleteFromCollection(collectionName, ids) {
	if (VERBOSE_LOGGING) { 
		console.log(`→ deleteFromCollection: ${collectionName}`);
		console.log(`→ → ids: ${ids}`);
	}
	const collection = await chromaClient.getCollection({
		name: collectionName,
	});
	await collection.delete({
		ids: ids,
	});
}


// ----------------------
// -- list collections --
// ----------------------
export async function listCollections() {
	if (VERBOSE_LOGGING) { console.log("→ listCollections"); }
	const collections = await chromaClient.listCollections();
	return collections;
}


// ----------------------------
// -- delete all collections --
// ----------------------------
export async function deleteAllCollections() {
	if (VERBOSE_LOGGING) { console.log("→ deleteAllCollections"); }
	const collections = await chromaClient.listCollections();

	for (const collection of collections) {
		await deleteCollection(collection.name);
	}
}


// ------------------------
// -- peek at collection --
// ------------------------
export async function peekCollection(collectionName, limit = 10) {
	if (VERBOSE_LOGGING) { console.log(`→ peekCollection: ${collectionName}`); }
	const collection = await chromaClient.getCollection({
		name: collectionName,
	});
	const results = await collection.peek({
		limit: limit,
	});
	return results;
}

export async function cleanupOldChromaDBCollections() {
    // --------------------------------------------------
    // -- Cleanup routine for old chromadb collections --
    // --------------------------------------------------
    setInterval(async () => {
        const collections = await listCollections();
		for (let collection of collections) {
			const collectionName = collection.name;
			const collectionAge = (Date.now() - new Date(collection.metadata.dateCreated).getTime());
			if (collectionAge > CHROMADB_COLLECTION_ALLOWED_AGE) {
				await deleteCollection(collectionName);
				console.log(`Deleted old collection: ${collectionName}`);
			}
		}
    }, CHROMADB_COLLECTION_CLEANUP_INTERVAL);
}


// ---------------------------------------------
// -- function to test various chroma methods --
// ---------------------------------------------
export async function testChormaMethods(collectionName) {
	console.info("------------------------------------");
	console.info("-- running Chroma bootup tests... --");
	console.info("------------------------------------");
	// create test collection
	await createCollection(collectionName);

	// add to test collection
	// create random number between 1 and 10000
	const randomNumber = Math.floor(Math.random() * 10000) + 1;
	const embeddingTestList = [0.1, 0.2, 0.3, 0.4, 0.5];

	await addToCollection(
		collectionName,
		`id${randomNumber}`,
		embeddingTestList,
		{ source: "my_source" },
		"This is a my text."
	).then(async () => {
		// query test collection with embeddings
		const testQueryResults = await queryCollectionEmbeddings(collectionName, [1.1, 0.2, -0.3, 0.4, 0.8], 10)
			.catch((error) => { console.error("Error querying collection: ", error); });
		console.log("testQueryResults: ", testQueryResults);
	});

	// list collections
	// await listCollections();

	// delete all collection
	// await deleteAllCollections();

	// peek at collection
	const peekResults = await peekCollection(collectionName, 10);

	if (peekResults && peekResults.ids.length > 0) {
		console.log("peekResults length: ", peekResults.ids.length);
		console.log("peekResults: ", peekResults);
	}

	// delete test collection after 5 seconds to allow for debugging
	await new Promise((resolve) => setTimeout(resolve, 5000));
	await deleteCollection(collectionName);
	console.info("-------------------------------------------");
	console.info("-- finishged running Chroma bootup tests --");
	console.info("-------------------------------------------");
}