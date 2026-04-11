const express = require("express");
const makeCalls = require("./callService");
const { setMessage } = require("./message");

const app = express();

/* Allow JSON input */
app.use(express.json());

/* Home route */

app.get("/", (req, res) => {
    res.send("Voice Agent Server Running");
});

/* Set message route */

app.get("/set-message", (req, res) => {

    const userMessage =
        "Hello, this is ABC Gym offering a free trial membership.";

    setMessage(userMessage);

    console.log("Message updated:", userMessage);

    res.send("Message saved successfully");

});

/* Start calling route */

app.get("/start-calls", async (req, res) => {

    await makeCalls();

    res.send("Calls started");

});

/* Start server */

app.listen(3000, () => {
    console.log("Server running on port 3000");
});