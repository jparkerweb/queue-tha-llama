// ===================
// == General Utils ==
// ===================


// -------------------
// -- generate GUID --
// -------------------
export function generateGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}


// --------------------
// -- delay function --
// --------------------
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


// -------------------------------------
// -- return passed string as boolean --
// -------------------------------------
export function toBoolean(str = 'false') {
    const normalizedStr = str.trim().toLowerCase();
    const truthyValues = ['true', 'yes', '1'];
    const falsyValues = ['false', 'no', '0', '', 'null', 'undefined'];

    if (truthyValues.includes(normalizedStr)) {
        return true;
    } else if (falsyValues.includes(normalizedStr)) {
        return false;
    }

    return false;
}


// ---------------------------------------------
// -- sort context query results by dateAdded --
// ---------------------------------------------
export async function sortResultsByDateAdded(queryResults) {
    if (queryResults && queryResults.ids[0].length > 0) {
        let ids = queryResults.ids[0];
        let metadatas = queryResults.metadatas[0];
        let documents = queryResults.documents[0];
        let sortedqueryResults = [];
        for (let i = 0; i < ids.length; i++) {
            sortedqueryResults.push({ id: ids[i], metadata: metadatas[i], document: documents[i] });
        }
        sortedqueryResults.sort((a, b) => (a.metadata.dateAdded > b.metadata.dateAdded) ? 1 : -1);
        queryResults.ids[0] = sortedqueryResults.map(result => result.id);
        queryResults.metadatas[0] = sortedqueryResults.map(result => result.metadata);
        queryResults.documents[0] = sortedqueryResults.map(result => result.document);
    }
    return queryResults;
}