let currentMessageElement = null;
let currentReader = null; // To hold the current reader
let currentController = null; // For aborting the fetch request
const stopButton = document.getElementById("stopButton"); // Stop button element
const sendButton = document.getElementById("sendButton"); // Send button element
const inputBox = document.getElementById('input-box'); // Input box element

// Event listener for the textarea to handle 'Enter' and 'Ctrl + Enter'
document.getElementById("input-box").addEventListener("keydown", function(event) {
    if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();  // Prevent the default action (inserting a new line)
        sendMessage();
    } else if (event.key === "Enter" && !event.ctrlKey) {
        // Allow new line insertion for just 'Enter'
        // No need to call preventDefault here, as we want the default behavior
    }
});

// Send Message
async function sendMessage() {
    // Abort any ongoing request
    abortCurrentRequest();

    const message = inputBox.value;
    inputBox.value = '';

    if (message) {
        createMessageElement('You', message);
        currentMessageElement = createMessageElement('LLM', '');

        currentController = new AbortController();
        const signal = currentController.signal;

        const response = await fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: message }),
            signal
        });

        if (response.body) {
            currentReader = response.body.getReader();
            readStream(currentReader);
            stopButton.disabled = false; // Enable the stop button when streaming starts
            sendButton.disabled = true; // Disable the send button during streaming
        }
    }
}

function readStream(reader) {
    reader.read().then(({ done, value }) => {
        if (done) {
            resetCurrentRequest();
            console.log('Stream complete');
            return;
        }

        const chunk = new TextDecoder().decode(value);
        appendToMessageElement(currentMessageElement, chunk);
        readStream(reader);
    }).catch(error => {
        if (error.name === 'AbortError') {
            console.log('Stream reading aborted');
        } else {
            console.error('Error reading stream:', error);
        }
        resetCurrentRequest();
    });
}

function abortCurrentRequest() {
    if (currentController) {
        currentController.abort();
        console.log('Request aborted');
    }
}

function resetCurrentRequest() {
    currentReader = null;
    currentController = null;
    currentMessageElement = null;
    stopButton.disabled = true; // Disable the stop button when streaming is stopped
    sendButton.disabled = false; // Re-enable the send button when streaming is stopped
    inputBox.focus(); // Set focus back to the input box
}

function createMessageElement(sender, initialMessage) {
    const messagesContainer = document.getElementById('messages');
    const messageElement = document.createElement('div');
    messageElement.textContent = `${sender}: ${initialMessage}`;
    messagesContainer.appendChild(messageElement);
    scrollToBottom();
    return messageElement;
}

function appendToMessageElement(messageElement, text) {
    if (messageElement) {
        messageElement.textContent += text;
        scrollToBottom();
    }
}

function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

sendButton.addEventListener("click", sendMessage);
stopButton.addEventListener("click", abortCurrentRequest); // Stop button listener
stopButton.disabled = true; // Initially disable the stop button
