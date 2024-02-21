// import environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import { generateGUID, toBoolean } from './utils.js';
import { embedText } from './embedding.js';
import { createCollection, addToCollection, deleteCollection } from './chroma.js';

const ONNX_EMBEDDING_MODEL = process.env.ONNX_EMBEDDING_MODEL || 'all-MiniLM-L6-v2';

async function embeddingTest() {
    // Create a collection if it doesn't already exist
    const collectionName = 'test-collection';
    await deleteCollection(collectionName);
    await createCollection(collectionName);

    const text = [
        ['🐕','EN','The quick brown fox jumped over the lazy dog.'],
        ['🐕','ZH','敏捷的棕色狐狸跳过了那只懒狗。'],
        ['🐕','ES','El veloz zorro marrón saltó sobre el perro perezoso.'],
        ['🐕','JP','機敏な茶色のキツネは怠惰な犬を飛び越えました。'],
        ['🐕','DE','De snelle bruine vos sprong over de luie hond heen.'],
        ['🐕','EN','A procrastinating canine'],
        ['🐄','EN','The quick brown fox jumped over the lazy cow.'],
        ['🐄','DE','Der schnelle Braunfuchs sprang über die faule Kuh.'],
        ['🐄','FR','Le rapide renard brun sauta par-dessus la vache paresseuse.'],
        ['🐄','ZH','敏捷的棕色狐狸跳过了懒惰的牛。'],
        ['🐄','ES','El veloz zorro marrón saltó sobre la vaca perezosa.'],
        ['🐄','EN','was the cow lazy?'],
        ['🐒','EN','Primates are known to eat bananas.'],
        ['🐒','EN','Some monkeys live in trees.'],
        ['🐒','DE','Einige Affen leben in Bäumen.'],
        ['🐒','FR','Certains singes vivent dans les arbres.'],
        ['🐒','ZH','有些猴子住在樹上。'],
        ['🐒','ES','Algunos monos viven en los árboles.'],
    ];

    // for each string in array embed the text
    for (const t of text) {
        const embeddingResults = await embedText(t[2], 512, 0);

        // Add the embedding to the collection
        for (const embeddingResult of embeddingResults) {
            const { text, embedding, tokenCount } = embeddingResult;
            const id = generateGUID();

            await addToCollection(
                collectionName,
                id,
                embedding,
                {
                    _emoji: t[0],
                    _lang: t[1],
                    source: "embedding_test",
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

// (ツ) → Run embedding test
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('');
console.log('(ツ) → Running embedding test...');
console.log(`(ツ) → Embedding Model ${ONNX_EMBEDDING_MODEL}`);
console.log('');
console.log('');
await embeddingTest();
