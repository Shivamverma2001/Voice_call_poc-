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
            introMessage
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

        console.log(
            "User input:",
            userInput
        );

        if (!userInput) {

            twiml.say(
                {
                    voice:
                        "alice"
                },
                "Sorry, I did not catch that. Please try again."
            );

            twiml.redirect(
                {
                    method:
                        "POST"
                },
                absoluteUrl(
                    "/voice/intro"
                )
            );

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
                    `You are a customer support agent. Keep response short. Caller said: ${userInput}`
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

            const lowerInput =
                userInput
                    .toLowerCase();

            const taskCompleted =
                lowerInput
                    .includes(
                        "refund"
                    )
                ||
                lowerInput
                    .includes(
                        "return"
                    )
                ||
                lowerInput
                    .includes(
                        "complaint"
                    )
                ||
                lowerInput
                    .includes(
                        "resolved"
                    )
                ||
                lowerInput
                    .includes(
                        "done"
                    )
                ||
                lowerInput
                    .includes(
                        "thank"
                    )
                ||
                lowerInput
                    .includes(
                        "bye"
                    );

            const exitPressed =
                dtmfDigits
                    === "9";

            if (
                taskCompleted
                ||
                exitPressed
            ) {

                console.log(
                    "Ending call — task completed"
                );

                twiml.say(
                    {
                        voice:
                            "alice"
                    },
                    "Your request has been completed successfully."
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
                        "/voice/intro"
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