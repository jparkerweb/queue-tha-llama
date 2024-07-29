// =======================
// == message-review.js ==
// =======================
// handle generating/loading the results list and message content


// ----------------------
// -- load sample data --
// ----------------------
// load random sample of emails, subjects, and message bodies from files
document.addEventListener('DOMContentLoaded', function() {
    const directions = ['inbound', 'outbound', 'internal']
    let messageData;

    fetch('message-review_data.json')
        .then(response => response.json())
        .then(dataJson  => {
            messageData = dataJson;
            generateResults(messageData, directions);
        });
});


// --------------------------
// -- generate random date --
// --------------------------
function generateRandomDate() {
    const now = new Date();
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate(), now.getHours(), now.getMinutes());

    const randomTime = oneMonthAgo.getTime() + Math.random() * (now.getTime() - oneMonthAgo.getTime());
    const randomDate = new Date(randomTime);

    const options = { month: 'short', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' };
    return randomDate.toLocaleString('en-US', options) + ' ET';
}

// ---------------------------
// -- generate results list --
// ---------------------------
// generate a list of 10 random results and their click handlers
function generateResults(messageData, directions = ['inbound', 'outbound', 'internal']) {
    const resultsList = document.querySelector('.results-list');
    const messageDataLength = messageData.length;
    document.getElementById("messagecount").innerText = `${messageDataLength} messages`;

    for (let i = 0; i < messageDataLength; i++) {
        // generate random message date
        const randomDate = generateRandomDate();

        const messageIndex = i;
        const message = messageData[messageIndex];

        // Get a random direction
        const direction = directions[Math.floor(Math.random() * directions.length)];

        const resultDiv = document.createElement('div');
        resultDiv.className = 'result';
        let innerHTML = `
            <div class="flex-row-center flex--space-between">
                <span class="result__email-address">${message.sender}</span>
                <span class="material-symbols-outlined color-hot-stone">email</span>
            </div>
            <div class="result__email-address">${message.recipient}</div>
            <div class="flex-row-center flex--space-between">
                <div class="result__subject">${message.subject}</div>
                <div class="result__message-direction">${direction}</div>
            </div>
            <div class="flex-row-center flex--space-between">
                <div class="result__date">${randomDate}</div>
                <div class="flex-row-center">
            `;
        
        if (message.nubAttachments && message.nubAttachments > 0) {
            innerHTML += `
                    <span class="result__attachment material-symbols-outlined color-medium-grey" data-filename="${message.audio}">attachment</span>
            `;
        }

        innerHTML += `
                    <span class="result__check material-symbols-outlined color-medium-grey">check</span>
                </div>
            </div>
        `;
        resultDiv.innerHTML = innerHTML;

        resultDiv.addEventListener('click', function() {
            // Remove 'active' class from all results
            document.querySelectorAll('.result').forEach(el => el.classList.remove('active'));

            // Add 'active' class to the clicked result
            resultDiv.classList.add('active');

            // Update message content
            const messageContentDiv = document.querySelector('.message-content');
            let innerHTML = `
                <div>
                    <span class='message-content__participant-label'>from</span>
                    <span class='hide'>:</span>
                    <span class='message-content__participant'>${message.sender}</span>
                </div>
                <div>
                    <span class='message-content__participant-label'>to</span>
                    <span class='hide'>:</span>
                    <span class='message-content__participant'>${message.recipient}</span>
                </div>
                <div class='message-content__subject'>
                    <span class='hide'>subject: </span>
                    ${message.subject}
                </div>`

            if (message.audio) {
                innerHTML += `
                    <div class='message-content__attachments'>
                        <span class='hide'>attachment: </span>
                        <span class="attachments__attachment-icon material-symbols-outlined color-medium-grey">attachment</span>
                        <span class='attachments__attachment' id='audioFilename' data-filename='${message.audio}'>${message.audio}</span>
                    </div>
                `;
            }
            
            innerHTML +=`
                <div class='message-content__body'>
                    <span class='hide'>body: </span>
                    ${message.body}
                </div>
            `;

            messageContentDiv.innerHTML = innerHTML;
            messageContentDiv.scrollTop = 0;

            initChat();
        });
        
        resultsList.appendChild(resultDiv);
    }
}

