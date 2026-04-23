require("dotenv").config();

const generateResponse = require("./aiService");
const generateVoice = require("./ttsService");
const makeRealCall = require("./twilioService");
const customerSupportPrompt = require("./prompt");

async function makeCalls() {
    try {
        console.log("makeCalls function started");

        // Read numbers from .env
        const numbers = process.env.CALL_NUMBERS.split(",");

        console.log("Numbers:", numbers);
        console.log("Starting call process...");

        // Step 1 — Generate AI message using FULL prompt
        const aiMessage = await generateResponse(
            customerSupportPrompt
        );

        console.log("AI Message:");
        console.log(aiMessage);

        // Step 2 — Generate voice file
        await generateVoice(aiMessage);

        // Step 3 — Make calls using Twilio
        for (const number of numbers) {
            console.log("Calling:", number);

            // Make real call
            await makeRealCall(number);

            console.log("Speaking message:");
            console.log(aiMessage);

            // Wait 2 seconds between calls
            await new Promise(resolve =>
                setTimeout(resolve, 2000)
            );

            console.log("Call completed:", number);
        }

        console.log("All calls finished.");

    } catch (error) {
        console.error("Error in makeCalls:", error.message);
    }
}

module.exports = makeCalls;