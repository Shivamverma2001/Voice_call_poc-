require("dotenv").config();

const express = require("express");
const makeCalls = require("./callService");
const { setMessage } = require("./message");

const app = express();

app.use(express.json());

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


app.listen(3000, () => {
    console.log("Server running on port 3000");
});