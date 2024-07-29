// ===============================================
// ==  Client-side JavaScript for the chat page ==
// ===============================================

let currentMessageElement = null;        // To hold the current message element
let currentReader = null;                // To hold the current reader
let currentController = null;            // For aborting the fetch request
let currentRequestId = null;             // To hold the current request ID
let isAwaitingResponse = false;          // Flag to track if we are waiting for a response
let magicPromptSuggestionsExist = false; // Flag to check if magic prompt suggestions exist
let HEARTBEAT_INTERVAL = 1000 * 2;       // Setup a default value for the heartbeat interval (fetch from server later)
let VERBOSE_LOGGING = false;             // Flag to enable verbose logging
let LLM_GRAPH_ENABLED = true;            // Flag to check if LLM graph is enabled
let WHISPER_ENABLED = false;             // Flag to check if Whisper server is enabled
let COLLECTION_NAME;                     // Session collection name
let MESSAGE_CONTEXT = '';                // Message context (this is the message content to be sent to the chat enpoint
                                         // along with the user prompt
let LLM_GRAPH_CREATED = true;            // Flag to check if a graph was already created
let DEFAULT_PROMPT = 'Please provide a concise summary of this message, focusing on its key points. Limit your response to five sentences or less, using simple and clear language.';

const collectionDiv = document.getElementById("collection"); // Collection element (to dispaly the collection name)
const requestidDiv = document.getElementById("requestid");   // Request ID element (to display the request ID)
const promptButton = document.getElementById("promptButton");    // Send button element
const graphButton = document.getElementById("graphButton");    // graph button element
const inputBox = document.getElementById("input-box");       // Input box element


// -------------------------
// -- Initialize the chat --
// -------------------------
async function initChat() {
    document.querySelector('.review-pane').classList.remove('-hidden'); // show review pane
    setMessageContext();                 // Set the message context
    fetchHeartbeatInterval();            // Fetch the heartbeat interval from the server
    await fetchLLMGraphEnabled()         // Fetch the LLM graph enabled flag from the server
    fetchWhisperEnabled()                // Fetch the whisper enabled flag from the server
    fetchCollectionName();               // Fetch the collection name from the server
    clearMessages();                     // Clear the messages container
    resetUIState();                      // Reset the UI state
    inputBox.value = DEFAULT_PROMPT;     // Set the default prompt
    LLM_GRAPH_CREATED = false;           // Reset the LLM graph created flag
    magicPromptSuggestionsExist = false; // Reset the magic prompt suggestions flag
    
    // Set up an interval to send heartbeat signals
    setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Is Verbose logging enabled?
    VERBOSE_LOGGING = fetchVerboseLogging();

    // Event listener for the input box
    inputBox.addEventListener("keydown", function(event) {
        if (event.key === "Enter" && event.ctrlKey) {
            event.preventDefault();
            sendMessage();
        } else if (event.key === "Enter" && !event.ctrlKey) {
            // Allow line breaks for Enter
        }
    });

    // send message Event listener
    promptButton.addEventListener("click", sendMessage);
    // graph button Event listener
    graphButton.addEventListener("click", graphMessage);
}


// ---------------------------------------------
// -- Function to create wizard modal options --
// ---------------------------------------------
function createWizardModalOption(suggestion, className) {
    const modalWizard = document.getElementById('wizardModal');
    const label = suggestion.label;
    const prompt = suggestion.prompt;
    let li = document.createElement('li');
    li.classList.add('modal-option');
    if (className) { li.classList.add(className); }
    li.setAttribute('data-value', prompt);
    
    // Create separate elements for label and prompt for better formatting
    let labelDiv = document.createElement('div');
    labelDiv.classList.add('modal-label');
    labelDiv.textContent = label;
    let promptDiv = document.createElement('div');
    promptDiv.classList.add('modal-prompt');
    promptDiv.textContent = prompt;

    li.appendChild(labelDiv);
    li.appendChild(promptDiv);

    li.addEventListener('click', function() {
        inputBox.value = prompt;
        modalWizard.style.display = 'none';
        promptButton.click();
    });

    return li;
}

// ---------------------------------
// -- setup modal window handlers --
// ---------------------------------
document.addEventListener('DOMContentLoaded', function() {
    const wizardButton = document.getElementById('wizardButton');
    const transcribeAudioButton = document.getElementById('transcribeAudioButton');
    const modalWizard = document.getElementById('wizardModal');
    const modalGraph = document.getElementById('graphModal');
    const wizardCloseButton = document.getElementById('wizardCloseButton');
    const graphCloseButton = document.getElementById('graphCloseButton');
    const inputBox = document.getElementById('input-box');
    
    // -------------------------------------------------------
    // -- Fetch suggestions from JSON file and add to modal --
    // -------------------------------------------------------
    fetch('prompt-suggestions_data.json')
        .then(response => response.json())
        .then(data => {
            var optionsList = document.querySelector('.modal-options');
            data.promptSuggestions.forEach(function(suggestion) {
                optionsList.appendChild(createWizardModalOption(suggestion, null));
            });
        })
        .catch(error => console.log('Error loading suggestions:', error));


    // -----------------------------------
    // -- Event listeners for the modal --
    // -----------------------------------
    wizardButton.addEventListener('click', function() {
        if (!magicPromptSuggestionsExist) {
            // remove old suggestions
            const elements = document.querySelectorAll('li.magic-prompt-suggestion');
            elements.forEach(element => {
                element.parentNode.removeChild(element);
            });

            // loading item
            const optionsList = document.querySelector('.modal-options');
            const li = document.createElement('li');
            li.classList.add('modal-option');
            li.classList.add('magic-prompt-suggestions--loader');
            li.id = 'magicPromptSuggestionsLoader';
            li.innerHTML = `<span class="wand">🪄</span> Loading contextual prompt suggestions...`;
            optionsList.prepend(li);
    
            addMagicPromptSuggestions();
            magicPromptSuggestionsExist = true;
        }
        modalWizard.style.display = 'flex';
        document.querySelector('.modal-options').scrollTop = 0;
    });

    wizardCloseButton.addEventListener('click', function() {
        modalWizard.style.display = 'none';
    });

    graphCloseButton.addEventListener('click', function() {
        modalGraph.style.display = 'none';
    });

    window.addEventListener('click', function(event) {
        if (event.target == modalWizard || event.target == modalGraph) {
            modalWizard.style.display = 'none';
            modalGraph.style.display = 'none';
        }
    });

    // ------------------------------------------------
    // -- event listener for transcribe audio button --
    // ------------------------------------------------
    transcribeAudioButton.addEventListener('click', function() {
        const filename = document.getElementById('audioFilename').getAttribute('data-filename');
        
        inputBox.value = ''; // Clear the input box
        inputBox.disabled = true;
        promptButton.disabled = true;
        graphButton.disabled = true;
        wizardButton.disabled = true;
        transcribeAudioButton.disabled = true;  

        currentMessageElement = createMessageElement('💬', `transcribe → “${filename}”`);

        fetch('/transcribe', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ filename })
        })
            .then(response => response.json())
            .then(data => {
                // Stop the animation
                document.querySelectorAll('.emoji-tilt').forEach(element => {
                    element.classList.remove('emoji-tilt');
                });

                // respond with transcription
                currentMessageElement = createMessageElement('🔊', '');
                appendToMessageElement(currentMessageElement, data.transcription.text);

                inputBox.value = ''; // Clear the input box
                inputBox.disabled = false;
                promptButton.disabled = false;
                graphButton.disabled
                wizardButton.disabled = false;
                transcribeAudioButton.disabled = false;
            })
            .catch(error => console.log('Error transcribing audio:', error));
    });
});



// ------------------------
// -- Reset the UI state --
// ------------------------
function resetUIState() {
    currentMessageElement = null;
    const requestidDiv = document.getElementById("requestid");
    requestidDiv.innerHTML = ''; // Clear the request ID
    currentReader = null;
    currentController = null;
    wizardButton.disabled = false;
    promptButton.disabled = false;
    isAwaitingResponse = false; // Reset the flag when the response is done
    inputBox.value = ''; // Clear the input box
    inputBox.disabled = false;
    inputBox.focus();

    graphButton.disabled = false;
    if (LLM_GRAPH_ENABLED) {
        graphButton.classList.remove('-hidden');
    } else {
        graphButton.classList.add('-hidden');
    }
    
    transcribeAudioButton.disabled = false;
    if (document.getElementById('audioFilename') && WHISPER_ENABLED) {
        const audioFilename = document.getElementById('audioFilename').getAttribute('data-filename');
        transcribeAudioButton.classList.remove('-hidden');
    } else {
        transcribeAudioButton.classList.add('-hidden');
    }
}

// --------------------
// -- clear messages --
// --------------------
function clearMessages() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.innerHTML = ''; // Clear the messages container
}

// ----------------------------------------------
// -- Fetch heartbeat interval from the server --
// ----------------------------------------------
async function fetchHeartbeatInterval() {
    try {
        const response = await fetch('/heartbeat-interval');
        const data = await response.json();
        HEARTBEAT_INTERVAL = data.heartbeatInterval;
        console.info('Heartbeat interval:', HEARTBEAT_INTERVAL)

        // Set up the heartbeat interval
        setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    } catch (error) {
        console.log('Error fetching heartbeat interval:', error);
        // Set a default value in case of error
        HEARTBEAT_INTERVAL = 1500;
        setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    }
}

// ------------------------------------
// -- check if LLM Gralph is enabled --
// ------------------------------------
async function fetchLLMGraphEnabled() {
    try {
        const response = await fetch('/graph-enabled');
        const data = await response.json();
        LLM_GRAPH_ENABLED = data.llmGraphEnabled;
        console.info('LLM Graph enabled:', LLM_GRAPH_ENABLED)
    } catch (error) {
        console.log('Error fetching LLM Graph enabled:', error);
        // Set a default value in case of error
        LLM_GRAPH_ENABLED = false;
    }
}

// ----------------------------------------
// -- check if Whisper server is enabled --
// ----------------------------------------
async function fetchWhisperEnabled() {
    try {
        const response = await fetch('/whisper-enabled');
        const data = await response.json();
        WHISPER_ENABLED = data.whisperEnabled;
        console.info('Whisper enabled:', WHISPER_ENABLED)
    } catch (error) {
        console.log('Error fetching Whisper enabled:', error);
        // Set a default value in case of error
        WHISPER_ENABLED = false;
    }
}

// ----------------------------------------------------
// -- set Message Context to be sent with the prompt --
// --   (content of the message displayed on screen) --
// ----------------------------------------------------
async function setMessageContext() {
    MESSAGE_CONTEXT = document.getElementById("messageConent").innerText;
    MESSAGE_CONTEXT += '\n\n\n';
}


// -----------------------------------------------------------
// -- Fetch collection name from the server for the session --
// -----------------------------------------------------------
async function fetchCollectionName() {
    try {
        const response = await fetch('/init-collection');
        const data = await response.json();
        COLLECTION_NAME = data.collectionName;
        console.info('Collection name:', COLLECTION_NAME)
        const collectionURL = `${window.location.href}list-collection?collectionName=${COLLECTION_NAME}`;
        collectionDiv.innerHTML = `<div>Chat Collection Id: <a target="${COLLECTION_NAME}" href="${window.location.href}list-collection?collectionName=${COLLECTION_NAME}">${COLLECTION_NAME}</a></div>`;
        document.getElementById("chatsession").href = collectionURL;
    } catch (error) {
        console.log('Error fetching collection name:', error);
    }
}


// ----------------------------------------------------------------
// -- Fetch Verbose Logging flag from the server for the session --
// ----------------------------------------------------------------
async function fetchVerboseLogging() {
    try {
        const response = await fetch('/verbose-logging');
        const data = await response.json();
        VERBOSE_LOGGING = data.verboseLogging;
        console.info('Verbose Logging:', VERBOSE_LOGGING)
    } catch (error) {
        console.log('Error fetching Verbose Logging:', error);
    }
}


// -----------------------------------------
// -- Function to send a heartbeat signal --
// -----------------------------------------
function sendHeartbeat() {
    if (currentRequestId && isAwaitingResponse) {
        fetch('/heartbeat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ requestId: currentRequestId })
        })
        .then(response => response.text()) // Read the response as text
        .then(message => { // Log the message and show the heartbeat indicator
            console.log(message);
            const heartbeatIndicator = document.getElementById('heartbeat-indicator');
            heartbeatIndicator.style.display = 'block';
            setTimeout(() => heartbeatIndicator.style.display = 'none', 1000); // Hide after 1 second
        })
        .catch(error => console.log('Error sending heartbeat:', error));
    }
}


// ----------------------------------------------------------
// -- Generate a unique Request ID to identify the request --
// ----------------------------------------------------------
async function generateRequestId() {
    const requestId = Math.random().toString(36).substr(2, 9);
    console.info(`Request ID: ${requestId}`);    
    
    const currentUrl = window.location.href;
    const redisDashboardLink = new URL('/admin/queues', currentUrl); // Append '/admin/queues' to the current URL

    requestidDiv.innerHTML = `Prompt Request ID: <a target="${requestId}" href="${redisDashboardLink}">${requestId}</a></div>`
    return requestId;
}


// ----------------------------------
// -- add magic prompt suggestions --
// ----------------------------------
async function addMagicPromptSuggestions() {
    const action = 'magic-prompt-suggestions'
    const requestId = await generateRequestId();
    currentRequestId = requestId;

    let attempts = 0; // Number of attempts to send the message
    let success = false; // Flag to track if the message was sent successfully

    while (!success && attempts < 3) { // Try up to 3 times
        currentController = new AbortController();
        const signal = currentController.signal;
        isAwaitingResponse = true;

        try {
            const response = await fetch(`/${action}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ requestId, COLLECTION_NAME, MESSAGE_CONTEXT }),
                signal
            });

            if (response.body) {
                currentReader = response.body.getReader();
                readStream(currentReader, requestId, '', action);
            }
            success = true; // Message sent successfully
        } catch (error) {
            console.log('Error during chat fetch:', error);
            attempts++; // Increment the attempt counter
            if (attempts < 3) { // Only wait if we will try again
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            } else {
                resetUIState(); // Reset the UI only after all attempts
            }
        }
    }
}


// ----------------------------------
// -- Send a message to the server --
// ----------------------------------
async function sendMessage(showQuestion = true) {
    const action = 'chat';
    const message = inputBox.value.trim();
    
    // Don't send empty messages
    if (!message) return;

    const requestId = await generateRequestId();
    currentRequestId = requestId;

    if (showQuestion) {
        // Create and display user's message
        createMessageElement('💬', message);
    }

    inputBox.value = '';
    inputBox.disabled = true;
    promptButton.disabled = true;
    graphButton.disabled = true;
    transcribeAudioButton.disabled = true;
    wizardButton.disabled = true;

    let attempts = 0; // Number of attempts to send the message
    let success = false; // Flag to track if the message was sent successfully

    while (!success && attempts < 3) { // Try up to 3 times
        currentController = new AbortController();
        const signal = currentController.signal;
        isAwaitingResponse = true;

        try {
            const response = await fetch(`/${action}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ prompt: message, requestId, COLLECTION_NAME, MESSAGE_CONTEXT }),
                signal
            });

            if (response.body) {
                currentReader = response.body.getReader();
                readStream(currentReader, requestId, message, action);
            }
            success = true; // Message sent successfully
        } catch (error) {
            console.log('Error during chat fetch:', error);
            attempts++; // Increment the attempt counter
            if (attempts < 3) { // Only wait if we will try again
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for 1 second
            } else {
                resetUIState(); // Reset the UI only after all attempts
            }
        }
    }
}



// ------------------------------------------------------------------
// -- Read the stream and append the chunks to the message element --
// ------------------------------------------------------------------
async function readStream(reader, requestId, prompt, action) {
    let accumulatedResponse = ''; // Variable to accumulate the response
    let startedResponse = false; // Flag to check if the response has started

    while (true) {
        try {
            const { done, value } = await reader.read();
            if (requestId !== currentRequestId) {
                console.log('Mismatched response');
                break;
            }

            if (done) {
                if (!accumulatedResponse.trim()) {
                    // Resend the same prompt if the response is empty
                    console.log('Empty response, resending prompt:', prompt);
                    inputBox.value = prompt; // Set the prompt back to the input box
                    if (action === 'chat') {
                        sendMessage(showQuestion = false); // Resend the message
                    } else if (action === 'graph') {
                        graphMessage(showQuestion = false); // Resend the graph message
                    } else if (action === 'magic-prompt-suggestions') {
                        addMagicPromptSuggestions(); // Resend the magic prompt suggestions request  
                    }
                } else {
                    // Stop the animation
                    document.querySelectorAll('.emoji-tilt').forEach(element => {
                        element.classList.remove('emoji-tilt');
                    });

                    // Add magic prompt suggestions to the Prompt Suggestions modal
                    if (action === 'magic-prompt-suggestions') {
                        const optionsList = document.querySelector('.modal-options');
                        const suggestions = JSON.parse(accumulatedResponse);
                        
                        const loader = document.getElementById('magicPromptSuggestionsLoader');
                        if (loader) { loader.remove(); }

                        for (let y of suggestions) {
                            const suggestion = {
                                label: `${y.emoji} ${y.title}`,
                                prompt: y.suggestion
                            }
                            const className = 'magic-prompt-suggestion';
                            let li = createWizardModalOption(suggestion, className);
                            li.style.opacity = 0;
                            optionsList.prepend(li);
                            setTimeout(() => {
                                window.getComputedStyle(li).opacity; // Force reflow
                                li.style.opacity = 1;
                            }, 100 * suggestion.length);
                        }
                    }

                    // Create the graph
                    if (action === 'graph') {
                        if (VERBOSE_LOGGING) {
                            console.log('-----------------------------------');
                            console.log('LLM relationship extration:', accumulatedResponse);
                        }

                        // extract only the tuples
                        accumulatedResponse = accumulatedResponse.replace(/\[\[/g, '\[')
                        accumulatedResponse = accumulatedResponse.replace(/\]\]/g, '\]')
                        
                        const onlyTuplesRegex = /(?:\[(.*?)\])/gu;
                        let onlyTuples = accumulatedResponse.match(onlyTuplesRegex);
                        if (VERBOSE_LOGGING) {
                            console.log('-----------------------------------');
                            console.log('onlyTuples:', onlyTuples);
                        }
                        
                        // extract valid three part tuples
                        const threePartTuplesRegex = /\["{0,1}[\p{L}\d\-_&\.\s'@]*"{0,1},\s{0,1}"{0,1}[\p{L}\d\-_&\.\s'@]*"{0,1},\s{0,1}"{0,1}[\p{L}\d\-_&\.\s'@]*"{0,1}\]/u;
                        const threePartTuples = onlyTuples.filter(tupleString => {
                            return tupleString.match(threePartTuplesRegex);
                        });
                        if (VERBOSE_LOGGING) {
                            console.log('-----------------------------------');
                            console.log('threePartTuples:', threePartTuples);
                        }

                        // convert the tuples to graph format
                        const graphData = convertTuplesToGraphFormat(threePartTuples);
                        if (VERBOSE_LOGGING) {
                            console.log('-----------------------------------');
                            console.log('graphData:', graphData);
                        }

                        // create the graph and show the modal
                        createGraphWithDynamicFeatures(graphData);
                    }
                    
                    // clear prompt request ID
                    requestidDiv.innerHTML = '';
                    if (action !== 'magic-prompt-suggestions') { resetUIState(); }
                }
                break;
            } else if (!startedResponse) {
                if (action !== 'magic-prompt-suggestions') { currentMessageElement = createMessageElement('🤖', ''); } // Prepare 🤖's message element
                startedResponse = true;
            }

            // Process the chunk
            const chunk = new TextDecoder().decode(value);
            if (action === 'graph') {
                if (accumulatedResponse === '') {
                    appendToMessageElement(currentMessageElement, 'please wait, organizing relationships and generating graph view 📝','temp');
                }
                appendToMessageElement(currentMessageElement, ` .`, 'temp');
                // appendToMessageElement(currentMessageElement, ` ${randomProgressCharacter()}`, 'temp');
            } else if (action === 'magic-prompt-suggestions') {
                // console.log(chunk);
            }
            else {
                appendToMessageElement(currentMessageElement, chunk);
            }
            accumulatedResponse += chunk; // Accumulate the response
        } catch (error) {
            console.log('Error reading stream:', error);

            // Stop the animation
            document.querySelectorAll('.emoji-tilt').forEach(element => {
                element.classList.remove('emoji-tilt');
            });

            // clear prompt request ID
            requestidDiv.innerHTML = '';

            resetUIState();
            break;
        }
    }
}


// ------------------------------------------------------
// -- Function to generate a random progress character --
// ------------------------------------------------------
function randomProgressCharacter() {
    // return a single random character from the progressCharacters array
    const progressCharacters = ['₁','₀'];
    return progressCharacters[Math.floor(Math.random() * progressCharacters.length)];
}


// ----------------------------------------------------------------------
// -- Create a message element and append it to the messages container --
// ----------------------------------------------------------------------
function createMessageElement(sender, initialMessage) {
    const messagesContainer = document.getElementById('messages');
    const messageElement = document.createElement('div');

    if (sender === '💬' || sender === '💠') {
        const emojiElement = document.createElement('span');
        emojiElement.textContent = sender;
        emojiElement.className = 'emoji-tilt'; // Add class for animation
        messageElement.appendChild(emojiElement);
        messageElement.appendChild(document.createTextNode(': ' + initialMessage));
    } else {
        const senderElement = document.createElement('span');
        senderElement.textContent = sender;
        messageElement.appendChild(senderElement);
        messageElement.appendChild(document.createTextNode(': ' + initialMessage));
    }

    messagesContainer.appendChild(messageElement);
    scrollToBottom();
    return messageElement;
}


// -------------------------------------------
// -- Append a chunk to the message element --
// -------------------------------------------
function appendToMessageElement(messageElement, text, optionalClass) {
    if (messageElement && text.trim()) {
        // Create a container for the chunk
        const chunkContainer = document.createElement('span');
        if (optionalClass) chunkContainer.className = optionalClass;
        chunkContainer.innerHTML = text;
        chunkContainer.style.opacity = 0;
        chunkContainer.style.transform = 'translateX(-20px)';
        chunkContainer.style.transition = 'opacity 0.5s ease-out, transform 0.5s ease-out';

        // Append the chunk container to the message element
        messageElement.appendChild(chunkContainer);

        // Trigger the animation
        setTimeout(() => {
            chunkContainer.style.opacity = 1;
            chunkContainer.style.transform = 'translateX(0)';
        }, 10);

        scrollSectionToTop(messageElement);
    }
}


// ------------------------------------------
// -- Scroll the section if not at the top --
// ------------------------------------------
function scrollSectionToTop(section) {
    const messagesContainer = document.getElementById('messages');
    // scroll down unless the section is at the top
    if (section.offsetTop > messagesContainer.scrollTop) {
        scrollToBottom();
    }
}


// ----------------------------------------------------
// -- Scroll to the bottom of the messages container --
// ----------------------------------------------------
function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// ----------------------
// -- Graph a message  --
// ----------------------
async function graphMessage(showQuestion = true) {
    // show the graph modal if the last action was to draw a graph
    if (LLM_GRAPH_CREATED) {
        const modalGraph = document.getElementById('graphModal');
        modalGraph.style.display = 'block';
        return;
    }

    const message = "Extract relationships from this message and display it in a 'Knowledge Graph'.";
    const action = 'graph';
    const requestId = await generateRequestId();
    currentRequestId = requestId; // Store the request ID

    if (showQuestion) {
        // Create and display user's message
        createMessageElement('💠', message);
    }

    inputBox.disabled = true;
    promptButton.disabled = true;
    graphButton.disabled = true;
    transcribeAudioButton.disabled = true;
    wizardButton.disabled = true;

    currentController = new AbortController();
    const signal = currentController.signal;
    isAwaitingResponse = true;

    try {
        const response = await fetch(`/${action}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: message, requestId, COLLECTION_NAME, MESSAGE_CONTEXT }),
            signal
        });

        if (response.body) {
            currentReader = response.body.getReader();
            readStream(currentReader, requestId, message, action);
        }
    } catch (error) {
        console.log('Error during graph fetch:', error);
        resetUIState();
    }
}


// ------------------------------------
// -- convert string to capital case --
// ------------------------------------
function toCapitalCase(str) {
    return str
      .split(' ') // Split the string into an array of words
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Capitalize the first letter of each word
      .join(' '); // Join the words back into a single string
}


// ----------------------------
// -- prune arrays to length --
// ----------------------------
function pruneArraysToLength(arr, length = 3) {
    return arr
        .map(item => {
            // Check if the item is a string and attempt to parse it
            if (typeof item === 'string') {
                try {
                    return JSON.parse(item);
                } catch (e) {
                    // Return null if parsing fails, to filter it out later
                    return null;
                }
            } else if (Array.isArray(item)) {
                // If the item is already an array, return it as is
                return item;
            } else {
                // If the item is neither a string nor an array, return null
                return null;
            }
        })
        .filter(subArr => subArr !== null && subArr.length === length); // Keep only non-null arrays of the specified length
}


// --------------------------------
// -- convertTuplesToGraphFormat --
// --------------------------------
// Function to convert tuples to Sigma.js format
function convertTuplesToGraphFormat(tuples) {
    const prunedTuples = pruneArraysToLength(tuples, 3);

    const nodes = {};
    const edges = [];
    
    prunedTuples.forEach((tuple, index) => {
        let [source, relation, target] = tuple;
        source = toCapitalCase(source.replace(/_/g, ' '));
        relation = relation.replace(/_/g, ' ').toLowerCase();
        target = toCapitalCase(target.replace(/_/g, ' '));

        // Ensure source node exists
        if (!nodes[source]) {
            nodes[source] = { id: source, label: source };
        }

        // Ensure target node exists
        if (!nodes[target]) {
            nodes[target] = { id: target, label: target };
        }

        // Create edge
        const edgeId = `e${index}`;
        edges.push({
            id: edgeId,
            source: source,
            target: target,
            label: relation,
            type: "arrow", // Assuming directed graph; adjust as needed
            size: 1,
            color: "#ccc"
        });
    });

    return {
        nodes: Object.values(nodes), // Convert node objects to array
        edges: edges
    };
}



// ----------------------------
// -- create knowledge graph --
// ----------------------------
function createGraphWithDynamicFeatures(data) {
    LLM_GRAPH_CREATED = true;
    appendToMessageElement(currentMessageElement, `graph complete 📊`);

    // delete all span tags with class name of 'temp'
    document.querySelectorAll('span.temp').forEach(element => { element.remove(); });

    // show the graph modal
    const modalGraph = document.getElementById('graphModal');
    modalGraph.style.display = 'block';

    // Clear existing SVG to ensure old graph data isn't displayed
    d3.select("#graph").select("svg").remove();

    // Append SVG to the body or a specific container with 100% width and height
    const svg = d3.select("#graph").append("svg")
        .attr("width", '100%')
        .attr("height", '100%')
        .attr("viewBox", `0 0 960 600`) // Adjust viewBox based on your preferred aspect ratio
        .style("display", "block") // Ensure SVG fills the container
        .style("max-width", "89vw")
        .style("height", "89vh"); // Adjust height automatically based on the aspect ratio

    // After appending the SVG, calculate its actual size
    const svgSize = svg.node().getBoundingClientRect();
    const width = svgSize.width;
    const height = svgSize.height;

    // Define zoom behavior
    const zoom = d3.zoom().on("zoom", (event) => {
        container.attr("transform", event.transform);
    });

    // Apply the zoom behavior to the SVG
    svg.call(zoom);

    // Add a 'g' element that will contain everything you draw.
    const container = svg.append("g");

    // Reset zoom handler
    document.getElementById("resetZoom").addEventListener("click", () => {
        // Use zoom.transform to update the zoom behavior's internal state
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    });

    // Calculate the number of connections for each node
    let nodeConnections = {};
    data.edges.forEach(edge => {
        nodeConnections[edge.source] = (nodeConnections[edge.source] || 0) + 1;
        nodeConnections[edge.target] = (nodeConnections[edge.target] || 0) + 1;
    });

    // Function to determine node size based on connections
    const getNodeSize = (id) => Math.max(5, Math.sqrt(nodeConnections[id] || 1) * 5);

    // Function to generate a random color
    const getRandomColor = () => `#${Math.floor(Math.random() * 16777215).toString(16)}`;

    // Simulation setup with forces
    const simulation = d3.forceSimulation(data.nodes)
        .force("link", d3.forceLink(data.edges).id(d => d.id).distance(100))
        .force("charge", d3.forceManyBody())
        .force("center", d3.forceCenter(width / 2, height / 2));

    // Draw lines for the links
    const link = container.append("g")
        .selectAll("line")
        .data(data.edges)
        .join("line")
        .attr("stroke-width", d => Math.sqrt(d.size))
        .attr("stroke", "#999")
        .attr("stroke-opacity", 0.6);

    // Draw circles for the nodes
    const node = container.append("g")
        .selectAll("circle")
        .data(data.nodes)
        .join("circle")
        .attr("r", d => getNodeSize(d.id))
        .attr("fill", d => getRandomColor())
        .call(drag(simulation));

    // Draw text for the nodes
    const nodeLabels = container.append("g")
        .selectAll("text")
        .data(data.nodes)
        .join("text")
        .text(d => d.label)
        .style("fill", "#333")
        .style("font-size", "10px")
        .attr("x", 8)
        .attr("y", "0.31em");

    // Draw text for the links
    const edgeLabels = container.append("g")
        .selectAll("text")
        .data(data.edges)
        .join("text")
        .text(d => d.label)
        .style("fill", "#555")
        .style("font-size", "8px")
        .attr("x", d => (d.source.x + d.target.x) / 2)
        .attr("y", d => (d.source.y + d.target.y) / 2);

    // Drag functionality
    function drag(simulation) {
        function dragstarted(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

    // Update positions on each tick
    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);

        node
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        nodeLabels
            .attr("x", d => d.x + getNodeSize(d.id) + 5)
            .attr("y", d => d.y);

        edgeLabels
            .attr("x", d => (d.source.x + d.target.x) / 2)
            .attr("y", d => (d.source.y + d.target.y) / 2);
    });
}
