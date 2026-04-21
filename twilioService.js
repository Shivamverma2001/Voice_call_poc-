require("dotenv").config();

const twilio = require("twilio");

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

async function makeRealCall(toNumber) {
    try {
        console.log("Attempting call to:", toNumber);

        const baseUrl = process.env.PUBLIC_BASE_URL;
        if (!baseUrl) {
            throw new Error(
                "PUBLIC_BASE_URL is required (example: https://your-ngrok-url.ngrok-free.app)"
            );
        }

        const call = await client.calls.create({
            to: toNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            url: `${baseUrl}/voice/intro`,
            method: "POST"
        });

        console.log("Call SID:", call.sid);

    } catch (error) {
        console.error("Call error:", error.message);
    }
}

module.exports = makeRealCall;