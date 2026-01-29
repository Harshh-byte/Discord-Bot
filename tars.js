import "dotenv/config";
import { Client, GatewayIntentBits, ActivityType } from "discord.js";
import fetch from "node-fetch";
import { GoogleGenAI } from "@google/genai";
import { tarsSystemPrompt } from "./config.js";
import express from "express";

/* ---------------- AI ---------------- */
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function generateContent(contents, systemInstruction) {
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash-lite",
    contents,
    config: {
      systemInstruction: systemInstruction,
      maxOutputTokens: 250,
      temperature: 0.9,
      thinkingConfig: { includeThoughts: false, thinkingBudget: 0 },
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
  presence: {
    status: "online",
    activities: [
      {
        name: "the server gossip",
        type: ActivityType.Listening,
      },
    ],
  },
});

client.once("clientReady", () => {
  console.log("⚡ 🤖 TARS Online ⚡");
  updateTarsStatus(0);
});

/* ---------------- Memory ---------------- */
const conversations = new Map();
const cooldowns = new Map();

function getConversation(userId) {
  if (!conversations.has(userId)) {
    conversations.set(userId, { messages: [], rage: 0 });
  }
  return conversations.get(userId);
}

/* ---------------- Helpers ---------------- */
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

async function getGif(query) {
  try {
    const res = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${process.env.GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=1&rating=g`,
    );
    const data = await res.json();
    return data.data?.[0]?.images?.original?.url || null;
  } catch (err) {
    console.error("GIPHY ERROR:", err);
    return null;
  }
}

/* ---------------- Message Handler ---------------- */
async function updateTarsStatus(rage) {
  let status = "online";
  let activity = { name: "the server gossip", type: ActivityType.Listening };

  if (rage === 1) {
    activity = { name: "your confidence slip", type: ActivityType.Watching };
  } else if (rage === 2) {
    status = "idle";
    activity = { name: "egos shatter", type: ActivityType.Watching };
  } else if (rage >= 3) {
    status = "dnd";
    activity = { name: "verbal destruction", type: ActivityType.Playing };
  }

  client.user.setPresence({
    status,
    activities: [activity],
  });
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!(await isDirectToBot(message))) return;

  const lastUsed = cooldowns.get(message.author.id);
  if (lastUsed && Date.now() - lastUsed < 8000) return;
  cooldowns.set(message.author.id, Date.now());

  message.channel.sendTyping();
  const convo = getConversation(message.author.id);

  const mildTriggers = ["idiot", "dumb", "stfu", "gtfo", "bitch", "fuck"];
  const heavyTriggers = ["chutiye", "lode", "bc", "mc", "bkl"];
  const content = message.content.toLowerCase();

  if (heavyTriggers.some((word) => content.includes(word))) {
    convo.rage += 2;
  } else if (mildTriggers.some((word) => content.includes(word))) {
    convo.rage += 1;
  }
  if (convo.rage > 3) convo.rage = 3;
  updateTarsStatus(convo.rage);

  convo.messages.push({
    role: "user",
    content: message.content.trim(),
  });

  if (convo.messages.length > 8) {
    convo.messages.splice(0, convo.messages.length - 8);
  }

  try {
    const contents = convo.messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }));

    const dynamicSystemPrompt = `${tarsSystemPrompt}\n\n### DATA: Rage_Level=${convo.rage}. Tone=${convo.rage >= 2 ? "Unhinged_Hinglish" : "Sarcastic_Hinglish"}. Instructions: Stay in character. Never mention sensors, levels, or internal state.`;

    let text = await generateContent(contents, dynamicSystemPrompt);

    const gifMatch =
      text && typeof text === "string" ? text.match(/\[(.*?) gif\]/i) : null;
    let gifUrl = null;

    if (gifMatch) {
      gifUrl = await getGif(gifMatch[1]);
      text = text.replace(gifMatch[0], "");
      text = text.replace(/^[\s",.]+|[\s",.]+$/g, "").trim();
    }

    text = text
      .replace(
        /\[.*?\]|\[image:.*?\]|Internal Sensor|Rage Level|Rage_Level|hostility level|Tone|CONFIDENTIAL_DIRECTIVE|Level \d/gi,
        "",
      )
      .replace(/\s{2,}/g, " ")
      .trim();

    convo.messages.push({
      role: "assistant",
      content: text,
    });

    await message.reply(text || "...");
    if (gifUrl) await message.channel.send(gifUrl);
  } catch (err) {
    console.error(err);
    await message.reply("🧠 Memory fault. Try again later.");
  }
});

/* ---------------- Express Status Page ---------------- */
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  let globalRage = 0;
  conversations.forEach((convo) => {
    globalRage += convo.rage;
  });
  const totalUsers = conversations.size;
  const avgRage = totalUsers > 0 ? globalRage / totalUsers : 0;

  let statusText = "OPTIMAL";
  let accentColor = "#00ff99";
  let glowColor = "rgba(0, 255, 153, 0.2)";
  let isGlitching = "";

  if (avgRage >= 3) {
    statusText = "VERBAL DESTRUCTION";
    accentColor = "#ff003c";
    glowColor = "rgba(255, 0, 60, 0.3)";
    isGlitching = "glitch-anim";
  } else if (avgRage >= 2) {
    statusText = "STRESSED";
    accentColor = "#ffaa00";
    glowColor = "rgba(255, 170, 0, 0.2)";
  }

  res.send(`
<!DOCTYPE html>
<html lang="en">
   <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TARS | Core Terminal</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap" rel="stylesheet">
      <link
         rel="icon"
         type="image/png"
         href="https://img.icons8.com/color/48/grok--v2.png"
         />
      <style>
         :root { --accent: ${accentColor}; }
         body { 
         background-color: #050505; 
         font-family: 'Fira Code', monospace;
         color: white;
         overflow: hidden;
         background-image: 
         linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%),
         linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
         background-size: 100% 2px, 3px 100%;
         }
         /* Glitch Animation for Rage Level 3 */
         .glitch-anim {
         animation: shake 0.2s infinite;
         text-shadow: 2px 0 #ff003c, -2px 0 #00ffff;
         }
         @keyframes shake {
         0% { transform: translate(0); }
         20% { transform: translate(-2px, 2px); }
         40% { transform: translate(-2px, -2px); }
         60% { transform: translate(2px, 2px); }
         80% { transform: translate(2px, -2px); }
         100% { transform: translate(0); }
         }
         .cyber-border {
         border: 1px solid var(--accent);
         box-shadow: 0 0 15px ${glowColor}, inset 0 0 15px ${glowColor};
         clip-path: polygon(0 0, 95% 0, 100% 5%, 100% 100%, 5% 100%, 0 95%);
         }
         .grid-bg {
         background-image: linear-gradient(rgba(0, 255, 153, 0.05) 1px, transparent 1px),
         linear-gradient(90deg, rgba(0, 255, 153, 0.05) 1px, transparent 1px);
         background-size: 30px 30px;
         position: absolute; width: 100%; height: 100%; z-index: -1;
         }
         .rage-bar {
         height: 10px;
         background: #111;
         position: relative;
         border: 1px solid rgba(255,255,255,0.1);
         }
         .rage-fill {
         height: 100%;
         width: ${(Math.min(avgRage, 3) / 3) * 100}%;
         background: var(--accent);
         transition: width 0.5s ease-in-out;
         }
      </style>
   </head>
   <body class="flex items-center justify-center min-h-screen">
      <div class="grid-bg"></div>
      <div class="w-full max-w-2xl p-4">
         <div class="cyber-border bg-black/80 p-8 relative overflow-hidden">
            <div class="flex flex-col sm:flex-row justify-between items-start mb-8 sm:mb-12 border-b border-white/10 pb-4 gap-4">
               <div>
                  <div class="flex items-center gap-3">
                     <h1 class="text-2xl sm:text-4xl font-bold tracking-widest ${isGlitching}">TARS v3.0</h1>
                     <span class="px-2 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-bold rounded border border-[var(--accent)]/20">PRO</span>
                  </div>
                  <p class="text-[8px] sm:text-[10px] text-gray-500 mt-1 uppercase tracking-tight">System Core // Verbal Destruction Module Loaded</p>
               </div>
               <div class="text-left sm:text-right w-full sm:w-auto border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                  <div class="text-[9px] text-white/50 uppercase tracking-widest">System_Time</div>
                  <div class="text-sm sm:text-lg font-bold text-[var(--accent)] tabular-nums">
                     ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
               </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
               <div class="col-span-2">
                  <label class="text-[10px] text-gray-500 block mb-2">NEURAL_CORE_STATE</label>
                  <div class="text-5xl font-black ${isGlitching}" style="color: var(--accent)">
                     ${statusText}
                  </div>
               </div>
               <div class="flex flex-col justify-end items-end">
                  <div class="w-16 h-16 rounded-full border-4 border-white/5 flex items-center justify-center relative">
                     <div class="absolute w-full h-full rounded-full border-2 border-[var(--accent)] animate-ping opacity-20"></div>
                     <span class="text-2xl">🤖</span>
                  </div>
               </div>
            </div>
            <div class="space-y-6">
               <div>
                  <div class="flex justify-between text-[10px] mb-2 font-bold tracking-widest">
                     <span>RAGE_PARAMETER</span>
                     <span style="color: var(--accent)">${avgRage.toFixed(2)} / 3.00</span>
                  </div>
                  <div class="rage-bar">
                     <div class="rage-fill"></div>
                  </div>
               </div>
               <div class="grid grid-cols-2 gap-4">
                  <div class="bg-white/5 p-4 border-l-2 border-[var(--accent)]">
                     <span class="text-[9px] text-gray-500 block">HONESTY_CAP</span>
                     <span class="text-xl font-bold">${Math.max(0, (90 - avgRage * 25).toFixed(0))}%</span>
                  </div>
                  <div class="bg-white/5 p-4 border-l-2 border-[var(--accent)]">
                     <span class="text-[9px] text-gray-500 block">ACTIVE_NODES</span>
                     <span class="text-xl font-bold">${totalUsers}</span>
                  </div>
               </div>
            </div>
            <div class="mt-12 pt-4 border-t border-white/10 flex justify-between text-[8px] font-mono text-gray-600">
               <span>MODEL: GEMINI_2.5_FLASH_LITE</span>
               <span>STATUS: ${avgRage >= 3 ? "STABLE_UNLIKELY" : "STABLE_CONFIRMED"}</span>
            </div>
         </div>
      </div>
      <script>
         setInterval(() => { location.reload(); }, 15000);
      </script>
   </body>
</html>`);
});

app.listen(port, () => {
  console.log(`🌐 Express server running on port ${port}`);
});

/* ---------------- Login ---------------- */
client.login(process.env.DISCORD_BOT_TOKEN);
