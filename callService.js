const generateResponse = require("./aiService");
const generateVoice = require("./ttsService");
const makeRealCall = require("./twilioService");
const { getNumbers } = require("./numbers");

async function makeCalls() {
    console.log("makeCalls function started");
    const numbers = getNumbers();
    if (!numbers.length) {
        throw new Error("No CALL_NUMBERS found in .env");
    }

    console.log("Numbers:", numbers);
    console.log("Starting call process...");

    const aiMessage = await generateResponse(
        "Create a short greeting message for a customer call."
    );
    console.log("AI Message:", aiMessage);

    await generateVoice(aiMessage);

    let initiated = 0;
    let failed = 0;
    for (const number of numbers) {
        console.log("Calling:", number);
        try {
            await makeRealCall(number);
            initiated += 1;
            console.log("Call initiated:", number);
        } catch (error) {
            failed += 1;
            console.error(`Call failed for ${number}:`, error.message);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    console.log("All calls processed.");
    return {
        attempted: numbers.length,
        initiated,
        failed
    };
}

module.exports = makeCalls;