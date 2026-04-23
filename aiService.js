const Groq = require("groq-sdk");

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function generateResponse(prompt) {
    if (!process.env.GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is missing in .env");
    }
    if (!process.env.GROQ_MODEL) {
        throw new Error("GROQ_MODEL is missing in .env");
    }

    const response = await groq.chat.completions.create({
        messages: [
            {
                role: "user",
                content: prompt
            }
        ],
        model: process.env.GROQ_MODEL,
        max_tokens: Number(process.env.GROQ_MAX_TOKENS) || 300
    });

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) {
        throw new Error("Groq returned an empty response");
    }

    console.log("AI Response:", text);
    return text;
}

module.exports = generateResponse;