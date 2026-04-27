require("dotenv").config();

const express = require("express");
const twilio = require("twilio");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const makeCalls = require("./callService");
const generateResponse = require("./aiService");
const generateVoice = require("./ttsService");
const { getMessage, setMessage } = require("./message");

const app = express();

const port = Number(process.env.PORT) || 3000;

const publicBaseUrl =
    (process.env.PUBLIC_BASE_URL || "")
        .replace(/\/+$/, "");

const callState = new Map();

const GENERATED_AUDIO_DIR =
    path.join(__dirname, "generated-audio");

if (!fs.existsSync(GENERATED_AUDIO_DIR)) {

    fs.mkdirSync(
        GENERATED_AUDIO_DIR,
        { recursive: true }
    );

}

app.use(
    "/audio",
    express.static(GENERATED_AUDIO_DIR)
);

function absoluteUrl(pathname) {

    if (!publicBaseUrl) {

        return pathname;

    }

    return `${publicBaseUrl}${pathname}`;

}

function shouldEndCall(userInput = "", dtmfDigits = "") {
    if (dtmfDigits === "9") {
        return true;
    }

    const normalized = userInput.trim().toLowerCase();
    if (!normalized) {
        return false;
    }

    // Do not end if caller clearly says issue is NOT resolved.
    const keepCallOpenPhrases = [
        "not resolved",
        "issue not resolved",
        "not done",
        "don't end call",
        "do not end call",
        "dont end call",
        "band mat karo",
        "mat band karo",
        "abhi mat kato"
    ];
    if (keepCallOpenPhrases.some((phrase) => normalized.includes(phrase))) {
        return false;
    }

    const closePhrases = [
        "thank you",
        "thanks",
        "bye",
        "goodbye",
        "that is all",
        "that's all",
        "all good",
        "issue resolved",
        "resolved",
        "done",
        "no that's it",
        "no thats it",
        "no further help",
        "no more help",
        "no more questions",
        "end call",
        "close this call",
        "you can hang up"
    ];

    const closePhrasesHindi = [
        "dhanyavaad",
        "shukriya",
        "bye",
        "theek hai bas",
        "ho gaya",
        "samasya hal ho gayi",
        "call band karo",
        "theek hai call band karo"
    ];

    return closePhrases.some((phrase) => normalized.includes(phrase))
        || closePhrasesHindi.some((phrase) => normalized.includes(phrase));
}

const LANGUAGE_BY_DIGIT = {
    "1": "English",
    "2": "Hindi",
    "3": "Telugu",
    "4": "Tamil",
    "5": "Kannada"
};

const MENU_BY_DIGIT = {
    "1": "delivery status",
    "2": "damaged or missing item",
    "3": "return or refund",
    "4": "customer care support"
};

app.use(express.json());

app.use(
    express.urlencoded({
        extended: false
    })
);

app.use(
    (req, res, next) => {

        console.log(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
        );

        next();

    }
);

app.get(
    "/",
    (req, res) => {

        res.send(
            "Voice Agent Server Running"
        );

    }
);

app.get(
    "/health",
    (req, res) => {

        res.json({
            ok: true,
            port,
            hasPublicBaseUrl:
                Boolean(
                    process.env.PUBLIC_BASE_URL
                )
        });

    }
);

app.post(
    "/set-message",
    (req, res) => {

        try {

            const userMessage =
                req.body.message;

            setMessage(
                userMessage
            );

            console.log(
                "Message updated:",
                userMessage
            );

            res.send(
                "Message saved successfully"
            );

        }
        catch (error) {

            res
                .status(400)
                .json({
                    error:
                        error.message
                });

        }

    }
);

app.get(
    "/start-calls",
    async (req, res) => {

        console.log(
            "START-CALLS endpoint triggered"
        );

        try {

            const result =
                await makeCalls();

            res.json({
                message:
                    "Calls started",
                attempted:
                    result.attempted,
                initiated:
                    result.initiated,
                failed:
                    result.failed
            });

        }
        catch (error) {

            console.error(
                "start-calls error:",
                error.message
            );

            res
                .status(500)
                .json({
                    error:
                        error.message
                });

        }

    }
);

app.all(
    "/voice/intro",
    async (req, res) => {

        const twiml =
            new twilio.twiml
                .VoiceResponse();

        const introMessage =
            getMessage();

        const gather =
            twiml.gather({

                input:
                    "speech dtmf",

                action:
                    absoluteUrl(
                        "/voice/respond"
                    ),

                method:
                    "POST",

                speechTimeout:
                    "auto",

                timeout: 6,

                actionOnEmptyResult:
                    true

            });

        gather.say(
            {
                voice:
                    "alice"
            },
            `${introMessage} For language selection, press 1 for English, 2 for Hindi, 3 for Telugu, 4 for Tamil, 5 for Kannada. To end the call anytime, press 9.`
        );

        twiml.say(
            {
                voice:
                    "alice"
            },
            "I did not hear anything. Please call again when you are ready. Goodbye."
        );

        twiml.hangup();

        res.type(
            "text/xml"
        );

        res.send(
            twiml.toString()
        );

    }
);

app.all(
    "/voice/menu",
    (req, res) => {
        const twiml = new twilio.twiml.VoiceResponse();
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
            "Please choose a service option now. Press 1 for delivery status, 2 for damaged or missing item, 3 for return or refund, 4 for customer care. Press 9 to end the call."
        );

        twiml.say(
            { voice: "alice" },
            "No input received. Ending the call now. Goodbye."
        );
        twiml.hangup();

        res.type("text/xml");
        res.send(twiml.toString());
    }
);

app.post(
    "/voice/respond",
    async (req, res) => {

        const twiml =
            new twilio.twiml
                .VoiceResponse();

        const callSid =
            (
                req.body.CallSid
                || ""
            ).trim();

        const currentState =
            callSid
                ? callState.get(
                      callSid
                  )
                  || {}
                : {};

        const speechResult =
            (
                req.body
                    .SpeechResult
                || ""
            ).trim();

        const dtmfDigits =
            (
                req.body
                    .Digits
                || ""
            ).trim();

        const userInput =
            speechResult
            || dtmfDigits;

        // End call anytime with DTMF 9.
        if (dtmfDigits === "9") {
            twiml.say(
                { voice: "alice" },
                "Thank you. Ending the call as requested. Goodbye."
            );
            twiml.hangup();
            res.type("text/xml");
            res.send(twiml.toString());
            return;
        }

        // Step 1: Language selection
        if (!currentState.language) {
            const selectedLanguage = LANGUAGE_BY_DIGIT[dtmfDigits];
            if (!selectedLanguage) {
                twiml.say(
                    { voice: "alice" },
                    "Please select a language. Press 1 for English, 2 for Hindi, 3 for Telugu, 4 for Tamil, 5 for Kannada. Press 9 to end the call."
                );
                twiml.redirect({ method: "POST" }, absoluteUrl("/voice/intro"));
                res.type("text/xml");
                res.send(twiml.toString());
                return;
            }

            if (callSid) {
                callState.set(callSid, {
                    ...currentState,
                    language: selectedLanguage,
                    menuOption: null
                });
            }

            twiml.say(
                { voice: "alice" },
                `You selected ${selectedLanguage}. Now choose a service option. Press 1 for delivery status, 2 for damaged or missing item, 3 for return or refund, 4 for customer care. Press 9 to end the call.`
            );
            twiml.redirect({ method: "POST" }, absoluteUrl("/voice/menu"));
            res.type("text/xml");
            res.send(twiml.toString());
            return;
        }

        // Step 2: Menu selection
        if (!currentState.menuOption) {
            const selectedMenu = MENU_BY_DIGIT[dtmfDigits];
            if (!selectedMenu) {
                twiml.say(
                    { voice: "alice" },
                    "Please choose a valid menu option. Press 1 for delivery status, 2 for damaged or missing item, 3 for return or refund, 4 for customer care. Press 9 to end the call."
                );
                twiml.redirect({ method: "POST" }, absoluteUrl("/voice/menu"));
                res.type("text/xml");
                res.send(twiml.toString());
                return;
            }

            if (callSid) {
                callState.set(callSid, {
                    ...currentState,
                    menuOption: selectedMenu
                });
            }

            twiml.say(
                { voice: "alice" },
                `You selected ${selectedMenu}. Please explain your issue now. Press 9 anytime to end the call.`
            );
            const gather = twiml.gather({
                input: "speech dtmf",
                action: absoluteUrl("/voice/respond"),
                method: "POST",
                speechTimeout: "auto",
                timeout: 6,
                actionOnEmptyResult: true
            });
            gather.say({ voice: "alice" }, "I am listening.");
            res.type("text/xml");
            res.send(twiml.toString());
            return;
        }

        console.log(
            "User input:",
            userInput
        );

        if (!userInput) {

            const promptText = currentState.menuOption
                ? "Sorry, I did not catch that. Please repeat your issue. Press 9 to end the call."
                : "Sorry, I did not catch that. Please select an option. Press 9 to end the call.";

            const gather =
                twiml.gather({
                    input:
                        "speech dtmf",
                    action:
                        absoluteUrl(
                            "/voice/respond"
                        ),
                    method:
                        "POST",
                    speechTimeout:
                        "auto",
                    timeout: 6,
                    actionOnEmptyResult:
                        true
                });

            gather.say(
                {
                    voice:
                        "alice"
                },
                promptText
            );

            twiml.say(
                {
                    voice:
                        "alice"
                },
                "No input received. Ending the call now. Goodbye."
            );
            twiml.hangup();

            res.type(
                "text/xml"
            );

            res.send(
                twiml.toString()
            );

            return;

        }

        try {

            const aiReply =
                await generateResponse(
                    `You are a customer support agent. Language selected by user: ${currentState.language}. Issue category selected by user: ${currentState.menuOption}. Keep response short and relevant. Caller said: ${userInput}`
                );

            twiml.say(
                {
                    voice:
                        "alice"
                },
                aiReply
                || "Thank you."
            );

            twiml.pause({
                length: 1
            });

            //
            // END CALL LOGIC
            //
            if (shouldEndCall(userInput, dtmfDigits)) {

                console.log(
                    "Ending call — user requested closure"
                );

                twiml.say(
                    {
                        voice:
                            "alice"
                    },
                    "Thank you. I am ending the call now."
                );

                twiml.say(
                    {
                        voice:
                            "alice"
                    },
                    "Thank you for contacting ShopEase customer support."
                );

                twiml.say(
                    {
                        voice:
                            "alice"
                    },
                    "Have a great day. Goodbye."
                );

                twiml.hangup();

            }
            else {

                twiml.redirect(
                    {
                        method:
                            "POST"
                    },
                    absoluteUrl(
                        "/voice/menu"
                    )
                );

            }

        }
        catch (error) {

            console.error(
                "Voice response error:",
                error.message
            );

            twiml.say(
                {
                    voice:
                        "alice"
                },
                "I am facing a technical issue right now. Please try again later. Goodbye."
            );

            twiml.hangup();

        }

        res.type(
            "text/xml"
        );

        res.send(
            twiml.toString()
        );

    }
);

app.post(
    "/voice/status",
    (req, res) => {

        console.log(
            "Twilio status callback:",
            {
                callSid:
                    req.body
                        .CallSid,

                callStatus:
                    req.body
                        .CallStatus,

                to:
                    req.body.To,

                from:
                    req.body.From
            }
        );

        const callSid =
            (req.body.CallSid || "").trim();
        const callStatus =
            (req.body.CallStatus || "").trim();
        if (callSid && callStatus === "completed") {
            callState.delete(callSid);
        }

        res.sendStatus(
            204
        );

    }
);

const server =
    app.listen(
        port,
        () => {

            console.log(
                `Server running on port ${port}`
            );

        }
    );

process.stdin.resume();

process.on(
    "SIGINT",
    () => {

        console.log(
            "Shutting down server..."
        );

        server.close(
            () =>
                process.exit(0)
        );

    }
);