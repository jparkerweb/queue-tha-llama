let currentMessageElement = null;
let currentReader = null; // To hold the current reader
let currentController = null; // For aborting the fetch request
let randomQuestions = []; // To hold the random questions

const stopButton = document.getElementById("stopButton"); // Stop button element
const sendButton = document.getElementById("sendButton"); // Send button element
const randomQuestionButton = document.getElementById("randomQuestionButton"); // Random question button element
const autoSendSwitch = document.getElementById("autoSendSwitch"); // Auto send switch element
const inputBox = document.getElementById("input-box"); // Input box element

// Event listener for the auto send switch
autoSendSwitch.addEventListener("change", function() {
    if (this.checked && !sendButton.disabled) {
        sendAutomatedMessage();
    }
});

// Event listener for the input box
inputBox.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        sendMessage();
    } else if (event.key === "Enter" && !event.ctrlKey) {
        // Allow line breaks for Enter
    }
});

// Load the random questions from the file
async function loadRandomQuestions() {
    try {
        const response = await fetch('random-questions.txt');
        const text = await response.text();
        randomQuestions = text.split('\n').filter(question => question.trim() !== '');
        setRandomQuestion();
    } catch (error) {
        console.error('Error loading random questions:', error);
    }
}

// Set a random question in the input box
function setRandomQuestion() {
    if (randomQuestions.length > 0) {
        const randomIndex = Math.floor(Math.random() * randomQuestions.length);
        inputBox.value = randomQuestions[randomIndex];
    }
}

// Send a message to the server
async function sendMessage() {
    if (inputBox.value.trim() === '') {
        setRandomQuestion();
    }

    const message = inputBox.value;
    if (!message) return;

    createMessageElement('💬', message); // Create and display user's message

    inputBox.value = '';
    stopButton.disabled = false;
    sendButton.disabled = true;
    randomQuestionButton.disabled = true;

    currentController = new AbortController();
    const signal = currentController.signal;

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: message }),
            signal
        });

        if (response.body) {
            currentReader = response.body.getReader();
            currentMessageElement = createMessageElement('🤖', ''); // Prepare 🤖's message element
            readStream(currentReader);
        }
    } catch (error) {
        console.error('Error during fetch:', error);
        resetUIState();
    }
}

// Read the stream and append the chunks to the message element
function readStream(reader) {
    reader.read().then(({ done, value }) => {
        if (done) {
            resetUIState();
            return;
        }

        // Stop the spinning animation
        document.querySelectorAll('.emoji-spin').forEach(element => {
            element.classList.remove('emoji-spin');
        });

        const chunk = new TextDecoder().decode(value);
        appendToMessageElement(currentMessageElement, chunk);
        readStream(reader);
    }).catch(error => {
        console.error('Error reading stream:', error);
        resetUIState();
    });
}

// Abort the current request and turn off the auto send switch
function abortCurrentRequest() {
    if (currentController) {
        currentController.abort();
        console.log('Request aborted');
    }
    
    autoSendSwitch.checked = false; // Turn off the auto send switch
    resetUIState(); // Reset the UI state after aborting
}

// Reset the UI state
function resetUIState() {
    currentReader = null;
    currentController = null;
    currentMessageElement = null;
    stopButton.disabled = true;
    sendButton.disabled = false;
    randomQuestionButton.disabled = false;
    inputBox.focus();

    if (autoSendSwitch.checked) {
        sendAutomatedMessage();
    }
}

// Send an automated message
function sendAutomatedMessage() {
    if (!sendButton.disabled) {
        sendMessage();
    }
}

// Create a message element and append it to the messages container
function createMessageElement(sender, initialMessage) {
    const messagesContainer = document.getElementById('messages');
    const messageElement = document.createElement('div');

    if (sender === '💬') {
        const emojiElement = document.createElement('span');
        emojiElement.textContent = sender;
        emojiElement.className = 'emoji-spin'; // Add class for animation
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

// Append a chunk to the message element
function appendToMessageElement(messageElement, text) {
    if (messageElement && text.trim()) {
        // Create a container for the chunk
        const chunkContainer = document.createElement('span');
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

        scrollToBottom();
    }
}

// Scroll to the bottom of the messages container
function scrollToBottom() {
    const messagesContainer = document.getElementById('messages');
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Event listeners and initial state
sendButton.addEventListener("click", sendMessage);
stopButton.addEventListener("click", abortCurrentRequest);
randomQuestionButton.addEventListener("click", setRandomQuestion);
stopButton.disabled = true; // Initially disable the stop button
loadRandomQuestions();
