require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const makeCalls = require("./callService");
const generateResponse = require("./aiService");
const { getMessage, setMessage } = require("./message");

const app = express();
const port = Number(process.env.PORT) || 3000;
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
const callState = new Map();

function absoluteUrl(pathname) {
    if (!publicBaseUrl) {
        return pathname;
    }
    return `${publicBaseUrl}${pathname}`;
}

function getDtmfReply(digits) {
    switch (digits) {
        case "1":
            return "Your order is currently out for delivery and should reach you by tomorrow evening.";
        case "2":
            return "I am sorry to hear that. Please tell me your order number after the beep so I can register a damaged or missing item complaint.";
        case "3":
            return "Sure. I can help you with a return or refund request. Please tell me your order number after the beep.";
        case "4":
            return "I am connecting your request to customer care. Please stay on the line and share your issue after the beep.";
        default:
            return "That is not a valid option. Please press 1, 2, 3, or 4.";
    }
}

function getFollowupInstruction(digits) {
    switch (digits) {
        case "1":
            return "Please share your order number so I can check your latest delivery status. You can start speaking now.";
        case "2":
            return "Please describe what went wrong. Tell me your order number, and whether the item is damaged or missing. You can start speaking now.";
        case "3":
            return "Please tell me your order number, the product you want to return, and the reason. You can start speaking now.";
        case "4":
            return "You are now connected to customer care. Please explain your issue in brief. You can start speaking now.";
        default:
            return "You can speak now, or press another option.";
    }
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
    console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );
    next();
});

app.get("/", (req, res) => {
    res.send("Voice Agent Server Running");
});

app.get("/health", (req, res) => {
    res.json({
        ok: true,
        port,
        hasPublicBaseUrl: Boolean(process.env.PUBLIC_BASE_URL)
    });
});

app.post("/set-message", (req, res) => {
    try {
        const userMessage = req.body.message;
        setMessage(userMessage);

        console.log("Message updated:", userMessage);

        res.send("Message saved successfully");
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get("/start-calls", async (req, res) => {
    console.log("START-CALLS endpoint triggered");

    try {
        const result = await makeCalls();

        res.json({
            message: "Calls started",
            attempted: result.attempted,
            initiated: result.initiated,
            failed: result.failed
        });
    } catch (error) {
        console.error("start-calls error:", error.message);

        res.status(500).json({
            error: error.message
        });
    }
});

//
// FIXED ROUTE — accepts both GET and POST
//
app.all("/voice/intro", (req, res) => {
    console.log("Twilio hit /voice/intro");

    const twiml = new twilio.twiml.VoiceResponse();
    const introMessage = getMessage();

    const gather = twiml.gather({
        input: "speech dtmf",
        action: absoluteUrl("/voice/respond"),
        method: "POST",
        speechTimeout: "auto",
        timeout: 6,
        actionOnEmptyResult: true
    });

    gather.say(
        { voice: "alice" },
        introMessage
    );

    gather.say(
        { voice: "alice" },
        "Please choose an option now. Press 1 for delivery status, press 2 for damaged or missing item, press 3 for return or refund, press 4 to speak with customer care. You can also say your issue after the beep."
    );

    twiml.say(
        { voice: "alice" },
        "I did not hear anything. Please call again when you are ready. Goodbye."
    );

    twiml.hangup();

    res.type("text/xml");
    res.send(twiml.toString());
});

app.all("/voice/listen", (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = (req.body.CallSid || req.query.CallSid || "").trim();
    const selectedOption = callSid ? callState.get(callSid)?.menuOption : null;

    const gather = twiml.gather({
        input: "speech dtmf",
        action: absoluteUrl("/voice/respond"),
        method: "POST",
        speechTimeout: "auto",
        timeout: 6,
        actionOnEmptyResult: true
    });

    if (selectedOption && ["1", "2", "3", "4"].includes(selectedOption)) {
        gather.say({ voice: "alice" }, getFollowupInstruction(selectedOption));
    } else {
        gather.say({ voice: "alice" }, "Please continue. You can speak now or press 1, 2, 3, or 4.");
    }

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
    const callSid = (req.body.CallSid || "").trim();

    const speechResult = (req.body.SpeechResult || "").trim();
    const dtmfDigits = (req.body.Digits || "").trim();

    const userInput =
        speechResult || dtmfDigits;

    if (!userInput) {
        twiml.say(
            { voice: "alice" },
            "Sorry, I did not catch that."
        );

        twiml.redirect(
            { method: "POST" },
            absoluteUrl("/voice/listen")
        );

        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    if (dtmfDigits) {
        if (callSid && ["1", "2", "3", "4"].includes(dtmfDigits)) {
            callState.set(callSid, { menuOption: dtmfDigits });
        }

        if (["1", "2", "3", "4"].includes(dtmfDigits)) {
            // For valid menu selections, directly guide caller and start listening.
            const gather = twiml.gather({
                input: "speech dtmf",
                action: absoluteUrl("/voice/respond"),
                method: "POST",
                speechTimeout: "auto",
                timeout: 6,
                actionOnEmptyResult: true
            });
            gather.say(
                { voice: "alice" },
                getFollowupInstruction(dtmfDigits)
            );
        } else {
            const reply = getDtmfReply(dtmfDigits);
            twiml.say({ voice: "alice" }, reply);
            twiml.pause({ length: 1 });
            twiml.redirect(
                { method: "POST" },
                absoluteUrl("/voice/listen")
            );
        }

        res.type("text/xml");
        res.send(twiml.toString());
        return;
    }

    try {
        const selectedOption = callSid ? callState.get(callSid)?.menuOption : null;
        let aiPrompt;

        if (selectedOption === "2") {
            aiPrompt = `You are a phone support assistant handling damaged or missing item complaints. Caller said: "${userInput}". Reply in 1 to 2 short sentences. Ask one useful next question (order number, item name, or delivery date).`;
        } else if (selectedOption === "3") {
            aiPrompt = `You are a phone support assistant handling return/refund requests. Caller said: "${userInput}". Reply in 1 to 2 short sentences. Ask one useful next question (order number, reason for return, or product condition).`;
        } else if (selectedOption === "4") {
            aiPrompt = `You are a customer care assistant. Caller said: "${userInput}". Reply politely in 1 to 2 short sentences and ask one clear next question to continue support.`;
        } else {
            aiPrompt = `You are on a live phone call. Keep the response under 2 short sentences. Caller said: ${userInput}`;
        }

        const aiReply =
            await generateResponse(
                aiPrompt
            );

        twiml.say(
            { voice: "alice" },
            aiReply ||
                "Thanks for sharing."
        );

        twiml.pause({
            length: 1
        });

        twiml.redirect(
            { method: "POST" },
            absoluteUrl("/voice/listen")
        );
    } catch (error) {
        console.error(
            "Voice response error:",
            error.message
        );

        twiml.say(
            { voice: "alice" },
            "I am facing a technical issue right now. Please try again later. Goodbye."
        );

        twiml.hangup();
    }

    res.type("text/xml");
    res.send(twiml.toString());
});

app.post("/voice/status", (req, res) => {
    const callSid = (req.body.CallSid || "").trim();
    console.log(
        "Twilio status callback:",
        {
            callSid,
            callStatus: req.body.CallStatus,
            to: req.body.To,
            from: req.body.From
        }
    );

    if (callSid && req.body.CallStatus === "completed") {
        callState.delete(callSid);
    }

    res.sendStatus(204);
});

app.use((error, req, res, next) => {
    console.error(
        "Unhandled server error:",
        error
    );

    res.status(500).json({
        error: "Internal server error"
    });
});

const server = app.listen(
    port,
    () => {
        console.log(
            `Server running on port ${port}`
        );
    }
);

process.stdin.resume();

process.on("SIGINT", () => {
    console.log(
        "Received SIGINT, shutting down server..."
    );

    server.close(() =>
        process.exit(0)
    );
});

process.on("SIGTERM", () => {
    console.log(
        "Received SIGTERM, shutting down server..."
    );

    server.close(() =>
        process.exit(0)
    );
});

process.on(
    "uncaughtException",
    error => {
        console.error(
            "Uncaught exception:",
            error
        );
    }
);

process.on(
    "unhandledRejection",
    reason => {
        console.error(
            "Unhandled rejection:",
            reason
        );
    }
);