require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const makeCalls = require("./callService");
const generateResponse = require("./aiService");
const { getMessage, setMessage } = require("./message");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
    res.send("Voice Agent Server Running");
});

app.post("/set-message", (req, res) => {
    const userMessage = req.body.message;

    setMessage(userMessage);

    console.log("Message updated:", userMessage);

    res.send("Message saved successfully");
});

app.get("/start-calls", async (req, res) => {
    console.log("START-CALLS endpoint triggered");

    await makeCalls();

    res.send("Calls started");
});

app.post("/voice/intro", (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const introMessage = getMessage();

    const gather = twiml.gather({
        input: "speech dtmf",
        action: "/voice/respond",
        method: "POST",
        speechTimeout: "auto",
        timeout: 6,
        actionOnEmptyResult: true
    });

    gather.say({ voice: "alice" }, introMessage);
    gather.say(
        { voice: "alice" },
        "Please tell me how I can help you after the beep."
    );

    twiml.say(
        { voice: "alice" },
        "I did not hear anything. Please call again when you are ready. Goodbye."
    );
    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/respond", async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const speechResult = (req.body.SpeechResult || "").trim();
    const dtmfDigits = (req.body.Digits || "").trim();
    const userInput = speechResult || dtmfDigits;

    if (!userInput) {
        twiml.say({ voice: "alice" }, "Sorry, I did not catch that.");
        twiml.redirect({ method: "POST" }, "/voice/intro");
        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    try {
        const aiReply = await generateResponse(
            `You are on a live phone call. Keep the response under 2 short sentences. Caller said: ${userInput}`
        );

        twiml.say({ voice: "alice" }, aiReply || "Thanks for sharing.");
        twiml.pause({ length: 1 });
        twiml.redirect({ method: "POST" }, "/voice/intro");
    } catch (error) {
        console.error("Voice response error:", error.message);
        twiml.say(
            { voice: "alice" },
            "I am facing a technical issue right now. Please try again later. Goodbye."
        );
        twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
});


app.listen(3000, () => {
    console.log("Server running on port 3000");
});