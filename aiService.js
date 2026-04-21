require("dotenv").config();
const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function generateResponse(prompt) {
    try {
        const response = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            model: process.env.GROQ_MODEL,
            max_tokens: Number(process.env.GROQ_MAX_TOKENS)
        });

        const text = response.choices[0].message.content;

        console.log("AI Response:");
        console.log(text);

        return text;

    } catch (error) {
        console.error("Error:", error.message);
    }
}

module.exports = generateResponse;