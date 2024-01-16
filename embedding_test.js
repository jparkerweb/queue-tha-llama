import dotenv from "dotenv";
dotenv.config();

import { generateGUID } from './utils.js';
import { embedText } from './embedding.js';
import { createCollection, addToCollection, deleteCollection } from './chroma.js';


export async function embeddingTest() {
    // Create a collection if it doesn't already exist
    const collectionName = 'test-collection';
    await deleteCollection(collectionName);
    await createCollection(collectionName);

    const text = [
        ['🐕','EN','The quick brown fox jumped over the lazy dog.'],
        ['🐕','EN','A procrastinating dog'],
        ['🐄','EN','The quick brown fox jumped over the lazy cow.'],
        ['🐄','DE','Der schnelle Braunfuchs sprang über die faule Kuh.'],
        ['🐄','FR','Le rapide renard brun sauta par-dessus la vache paresseuse.'],
        ['🐄','ZH','敏捷的棕色狐狸跳过了懒惰的牛。'],
        ['🐄','ES','El veloz zorro marrón saltó sobre la vaca perezosa.'],
        ['🐄','EN','was the cow lazy?'],
        ['🐒','EN','Monkeys like to eat bananas..'],
        ['🐒','EN','Some monkeys live in trees.'],
        ['🐒','DE','Einige Affen leben in Bäumen.'],
        ['🐒','FR','Certains singes vivent dans les arbres.'],
        ['🐒','ZH','有些猴子住在樹上。'],
        ['🐒','ES','Algunos monos viven en los árboles.'],
    ];

    // for each string in array embed the text
    for (const t of text) {
        const embeddingResults = await embedText(t[2]);

        // Add the embedding to the collection
        for (const embeddingResult of embeddingResults) {
            const { text, embedding, tokenCount } = embeddingResult;
            const id = generateGUID();

            await addToCollection(
                collectionName,
                id,
                embedding,
                {
                    source: "embedding_test",
                    emoji: t[0],
                    lang: t[1],
                    tokenCount: tokenCount,
                    dateAdded: new Date().toISOString(),
                },
                text
            ).then(async () => {
                console.log(`Added embedding for: ${t[1]} → ${text}`);
            });
        }
    }
}