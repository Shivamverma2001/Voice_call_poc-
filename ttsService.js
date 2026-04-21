const gTTS = require("gtts");

function generateVoice(message) {
    return new Promise((resolve, reject) => {
        const filePath = "output.mp3";

        const tts = new gTTS(message, "en");

        tts.save(filePath, function (err) {
            if (err) {
                console.error("Voice error:", err);
                reject(err);
            } else {
                console.log("Voice file created:", filePath);
                resolve(filePath);
            }
        });
    });
}

module.exports = generateVoice;