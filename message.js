let message =
"Hello, this is a demo call from my AI voice agent.";

function getMessage() {
    return message;
}

function setMessage(newMessage) {
    message = newMessage;
}

module.exports = {
    getMessage,
    setMessage
};