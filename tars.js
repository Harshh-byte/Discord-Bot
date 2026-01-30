import "dotenv/config";
import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import { GoogleGenAI } from "@google/genai";
import { tarsSystemPrompt } from "./config.js";
import express from "express";
import { getConversation, saveConversation } from "./database.js";

/* ---------------- AI ---------------- */
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateContent(contents, systemInstruction) {
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents,
    config: {
      systemInstruction: systemInstruction,
      maxOutputTokens: 250,
      temperature: 1.0,
      tools: [{ googleSearch: {} }],
    },
  });
  return res.text;
}

/* ---------------- Discord ---------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("clientReady", () => {
  console.log("🤖 TARS Online");
  client.user.setPresence({
    status: "idle",
    activities: [{ name: "egos shatter", type: ActivityType.Watching }],
  });
});

/* ---------------- Memory ---------------- */
const cooldowns = new Map();

/* ---------------- Helpers ---------------- */
function getTarsTime() {
  const now = new Date();
  const options = { timeZone: "Asia/Kolkata" };
  return {
    time: new Intl.DateTimeFormat("en-IN", {
      ...options,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(now),
    date: new Intl.DateTimeFormat("en-IN", {
      ...options,
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(now),
  };
}

async function isDirectToBot(message) {
  if (message.mentions.has(client.user)) return true;
  if (message.reference?.messageId) {
    try {
      const original = await message.fetchReference();
      return original?.author?.id === client.user.id;
    } catch {
      return false;
    }
  }
  return false;
}

/* ---------------- Message Handler ---------------- */
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!(await isDirectToBot(message))) return;

  const lastUsed = cooldowns.get(message.author.id);
  if (lastUsed && Date.now() - lastUsed < 8000) return;
  cooldowns.set(message.author.id, Date.now());

  message.channel.sendTyping();

  const convo = await getConversation(message.author.id);

  convo.messages.push({ role: "user", content: message.content.trim() });
  if (convo.messages.length > 10) convo.messages.shift();

  try {
    const contents = convo.messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const currentTime = getTarsTime();

    const dynamicSystemPrompt = `${tarsSystemPrompt}

    ### LIVE_DATA:
    - Current_Time: ${currentTime.time}
    - Current_Date: ${currentTime.date}
    - Location: India (IST)
    [Instruction: Respond in a savage Desi style. Use Hinglish if appropriate.]
    `;

    let text = await generateContent(contents, dynamicSystemPrompt);

    text = text
      .replace(/\[.*?\]/g, "")
      .replace(/(Rage|Level|Status|System|DATABASE|Internal):?\s*\d?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    convo.messages.push({ role: "assistant", content: text });
    await saveConversation(message.author.id, convo);
    await message.reply(text || "...");
  } catch (err) {
    console.error("AI Error:", err);
    await message.reply("🧠 Memory fault. Try again later.");
  }
});

/* ---------------- Express Server ---------------- */
const app = express();
app.get("/", (req, res) => {
  const time = getTarsTime();

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Tars Status</title>
      <link rel="icon" type="image/png" href="https://img.icons8.com/color/48/robot-2.png">
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
      <style>
        body {
          background: #000;
          color: #fff;
          font-family: 'JetBrains Mono', monospace;
          padding: 20px;
          line-height: 1.6;
        }
      </style>
    </head>
    <body>
      TARS is Alive.<br>
      TIME: ${time.full}
    </body>
    </html>
  `);
});
app.listen(process.env.PORT || 3000, () => console.log(`🌐 Server running`));

client.login(process.env.DISCORD_BOT_TOKEN);
