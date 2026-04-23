const twilio = require("twilio");

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

async function makeRealCall(toNumber) {
    console.log("Attempting call to:", toNumber);

    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl) {
        throw new Error(
            "PUBLIC_BASE_URL is required (example: https://your-ngrok-url.ngrok-free.app)"
        );
    }

    if (!process.env.TWILIO_PHONE_NUMBER) {
        throw new Error("TWILIO_PHONE_NUMBER is missing in .env");
    }

    const call = await client.calls.create({
        to: toNumber,
        from: process.env.TWILIO_PHONE_NUMBER,
        url: `${baseUrl.replace(/\/+$/, "")}/voice/intro`,
        method: "POST",
        statusCallback: `${baseUrl.replace(/\/+$/, "")}/voice/status`,
        statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
        statusCallbackMethod: "POST"
    });

    console.log("Call SID:", call.sid);
    return call;
}

module.exports = makeRealCall;