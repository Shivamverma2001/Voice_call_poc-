require("dotenv").config();

const twilio = require("twilio");

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

async function makeRealCall(toNumber) {
    try {
        console.log("Attempting call to:", toNumber);

        const call = await client.calls.create({
            to: toNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
            twiml: `
                <Response>
                    <Say>
                        Hello, this is your AI voice agent test call.
                    </Say>
                </Response>
            `
        });

        console.log("Call SID:", call.sid);

    } catch (error) {
        console.error("Call error:", error.message);
    }
}

module.exports = makeRealCall;