const { Module } = require("../lib/plugins");
const { mention } = require("./bin/mention");
const { personalDB } = require("../lib/database");

Module({
  on: "text",
})(async (message) => {
  try {
    // Get bot identifiers
    const botJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const botLid = message.conn.user.lid?.split(":")[0] + "@lid";

    const botNumbers = [botJid.split("@")[0], botLid?.split("@")[0]].filter(
      Boolean
    );

    // Check if bot is mentioned
    const isMentioned = message.mentions?.some((mention) => {
      const mentionNumber = mention.split("@")[0];
      return botNumbers.includes(mentionNumber);
    });

    if (!isMentioned || message.fromMe) return;

    // Fetch mention configuration from database
    const botNumber = botNumbers[0];
    const { mention: mentionData } = await personalDB(
      ["mention"],
      { content: {} },
      "get",
      botNumber
    );

    // Validate mention feature is enabled
    if (
      !mentionData?.status ||
      mentionData.status !== "true" ||
      !mentionData.message
    ) {
      console.log("❌ Mention feature disabled or no message configured");
      return;
    }
    const senderJid = message.sender;
    const senderNumber = senderJid.split("@")[0];

    const mentionMsg = {
      client: message.conn,
      jid: message.from,
      sender: senderJid,
      number: senderNumber,
      key: message.key,
      message: message.raw.message,
    };

    await mention(mentionMsg, mentionData.message);

    console.log(`✅ Mention response sent to ${senderNumber}`);
  } catch (error) {
    console.error("❌ Mention plugin error:", error);
  }
});

// Command to set mention message (supports multi-line)
Module({
  command: "setmention",
  package: "mention",
  description: "Set bot mention auto-reply message",
  usage: ".setmention <message>",
})(async (message, match) => {
  try {
    // Get full message text (including newlines)
    const fullText = message.body.replace(/^\.setmention\s*/i, "").trim();

    if (!fullText) {
      return await message.reply(
        "*📋 Mention Setup Guide*\n\n" +
          "*Text Format:*\n" +
          "`.setmention Hey &sender! 👋`\n\n" +
          "*Video Format:*\n" +
          "```\n.setmention\ntype/video\nURL1\nURL2\nURL3\n&sender summoned me!```\n\n" +
          "*Audio Format:*\n" +
          '```\n.setmention\ntype/audio URL\n{"waveform":[99,0,99],"contextInfo":{...}}```\n\n' +
          "*Variables:*\n" +
          "• &sender - Mentions user\n\n" +
          "*Note:* Each URL on new line"
      );
    }

    const botJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const botNumber = botJid.split("@")[0];

    // Save to database (preserve newlines and formatting)
    await personalDB(
      ["mention"],
      {
        content: {
          status: "true",
          message: fullText,
        },
      },
      "set",
      botNumber
    );

    // Show preview (truncate if too long)
    const preview =
      fullText.length > 200 ? fullText.substring(0, 200) + "..." : fullText;

    await message.reply(
      "✅ *Mention Message Updated!*\n\n" +
        `📝 Preview:\n${preview}\n\n` +
        "The bot will now respond when mentioned.\n\n" +
        "Commands:\n" +
        "• `.mention off` - Disable\n" +
        "• `.getmention` - View full config"
    );
  } catch (error) {
    console.error("❌ Error setting mention:", error);
    await message.reply("❌ Failed to update mention message");
  }
});

// Command to enable/disable mention
Module({
  command: "mention",
  package: "mention",
  description: "Enable or disable mention auto-reply",
  usage: ".mention on/off",
})(async (message, match) => {
  try {
    const action = match?.toLowerCase();

    if (!action || !["on", "off"].includes(action)) {
      return await message.reply(
        "❌ Invalid option!\n\n" + "Usage: .mention on/off"
      );
    }

    const botJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const botNumber = botJid.split("@")[0];

    // Get current config
    const { mention: currentData } = await personalDB(
      ["mention"],
      { content: {} },
      "get",
      botNumber
    );

    const newStatus = action === "on" ? "true" : "false";

    // Update database
    await personalDB(
      ["mention"],
      {
        content: {
          status: newStatus,
          message: currentData?.message || "Hey &sender! You mentioned me? 👋",
        },
      },
      "set",
      botNumber
    );

    await message.reply(
      `✅ Mention auto-reply ${action === "on" ? "enabled" : "disabled"}!`
    );
  } catch (error) {
    console.error("❌ Error toggling mention:", error);
    await message.reply("❌ Failed to update mention status");
  }
});

// Command to view current mention config
Module({
  command: "getmention",
  package: "mention",
  description: "View current mention configuration",
})(async (message) => {
  try {
    const botJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";
    const botNumber = botJid.split("@")[0];

    const { mention: mentionData } = await personalDB(
      ["mention"],
      { content: {} },
      "get",
      botNumber
    );

    if (!mentionData) {
      return await message.reply(
        "❌ No mention configuration found!\n\n" +
          "Use .setmention to configure."
      );
    }

    const status = mentionData.status === "true" ? "✅ Enabled" : "❌ Disabled";
    const msg = mentionData.message || "Not set";

    // Count URLs if video/audio type
    let urlCount = 0;
    if (msg.includes("type/video") || msg.includes("type/audio")) {
      urlCount = (msg.match(/https:\/\//g) || []).length;
    }

    const preview = msg.length > 300 ? msg.substring(0, 300) + "..." : msg;

    await message.reply(
      `*📋 Mention Configuration*\n\n` +
        `Status: ${status}\n` +
        (urlCount > 0 ? `Media URLs: ${urlCount}\n` : "") +
        `\nMessage:\n${preview}\n\n` +
        `Commands:\n` +
        `• .mention on/off - Toggle feature\n` +
        `• .setmention <text> - Update message\n` +
        `• .getmention - View config`
    );
  } catch (error) {
    console.error("❌ Error getting mention:", error);
    await message.reply("❌ Failed to fetch mention configuration");
  }
});
