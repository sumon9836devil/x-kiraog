const { Module } = require("../lib/plugins");
const fetch = require("node-fetch");

Module({
  command: "gemini",
  package: "ai",
  description: "Chat with gemini",
})(async (message, match) => {
  if (!match) return message.send("_Please provide a question_");

  try {
    const sent = await message.send("🤔 Thinking...");
    const res = await fetch(
      `https://api.zenzxz.my.id/api/ai/gemini?text=${encodeURIComponent(match)}`
    );
    const data = await res.json();

    if (!data.success || !data.data || !data.data.response) {
      return await message.send(
        "⚠️ Failed to get response. Please try again.",
        { edit: sent.key }
      );
    }

    const answer = data.data.response;
    await message.send(answer, { edit: sent.key });
  } catch (error) {
    console.error("[gemini ERROR]:", error.message);
    await message.send("⚠️ An error occurred. Please try again later.");
  }
});
