let currentMessageElement = null;

async function sendMessage() {
    const inputBox = document.getElementById('input-box');
    const message = inputBox.value;
    inputBox.value = '';

    if (message) {
        createMessageElement('You', message); // Display the user's message
        currentMessageElement = createMessageElement('LLM', ''); // Prepare LLM's message element

        const response = await fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: message })
        });

        if (response.body) {
            const reader = response.body.getReader();
            readStream(reader);
        }
    }
}

function readStream(reader) {
    reader.read().then(({ done, value }) => {
        if (done) {
            currentMessageElement = null; // Reset for the next message
            console.log('Stream complete');
            return;
        }

        // Update LLM's message element with the new chunk
        const chunk = new TextDecoder().decode(value);
        appendToMessageElement(currentMessageElement, chunk);

        // Read the next chunk
        readStream(reader);
    }).catch(error => {
        console.error('Error reading stream:', error);
        if (currentMessageElement) {
            currentMessageElement.textContent = 'Error receiving response';
        }
    });
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

document.getElementById("sendButton").addEventListener("click", sendMessage);
