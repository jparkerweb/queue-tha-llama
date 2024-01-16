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