const { MediaUrls } = require("../../lib/handier");

async function mention(m, text) {
  try {
    const types = [
      "type/image",
      "type/video",
      "type/audio",
      "type/sticker",
      "type/gif",
    ];

    // Extract JSON (handle multiline)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonArray = jsonMatch ? [jsonMatch[0]] : null;

    let msg = jsonArray ? text.replace(jsonArray[0], "").trim() : text;
    let type = "text";
    let message = {
      contextInfo: {
        mentionedJid: [m.sender],
        isForwarded: false,
        forwardingScore: 0,
      },
    };

    // Determine message type
    for (const i in types) {
      if (msg.includes(types[i])) {
        type = types[i].replace("type/", "");
        break;
      }
    }

    // Parse JSON config if exists
    if (jsonArray && jsonArray.length > 0) {
      try {
        const parsed = JSON.parse(jsonArray[0]);

        // Deep merge contextInfo
        if (parsed.contextInfo) {
          message.contextInfo = {
            ...message.contextInfo,
            ...parsed.contextInfo,
            mentionedJid: [m.sender], // Keep mention
            isForwarded: false,
            forwardingScore: 0,
          };

          // Preserve waveform for audio
          if (parsed.waveform) {
            message.waveform = parsed.waveform;
          }
        }

        // Merge other properties
        const { contextInfo, ...otherProps } = parsed;
        message = { ...message, ...otherProps };

        // Remove forward flags
        if (message.contextInfo) {
          delete message.contextInfo.forwardedNewsletterMessageInfo;
        }
      } catch (e) {
        console.error("Failed to parse JSON config:", e);
      }
    }

    // Handle link preview
    if (message.linkPreview) {
      message.contextInfo = message.contextInfo || {};
      message.contextInfo.externalAdReply = message.linkPreview;
      delete message.linkPreview;
    }

    // Handle thumbnail
    if (message.contextInfo?.externalAdReply?.thumbnail) {
      message.contextInfo.externalAdReply.thumbnailUrl =
        message.contextInfo.externalAdReply.thumbnail;
      delete message.contextInfo.externalAdReply.thumbnail;
    }

    // Get media URLs (extract from multiline text)
    let URLS = MediaUrls(msg);

    // Handle media messages
    if (type !== "text" && URLS && URLS.length > 0) {
      // Clean message text
      URLS.forEach((url) => {
        msg = msg.replace(url, "");
      });
      msg = msg.replace("type/", "").replace(type, "").replace(/,/g, "").trim();

      // Pick random URL if multiple
      let URL = URLS[Math.floor(Math.random() * URLS.length)];

      // Replace &sender in caption
      if (msg && msg.includes("&sender")) {
        msg = msg.replace(/&sender/g, "@" + m.number);
        message.contextInfo.mentionedJid = [m.sender];
      }

      // Add caption if exists
      if (msg) {
        message.caption = msg;
      }

      switch (type) {
        case "image":
          message.image = { url: URL };
          message.mimetype = "image/jpeg";
          break;

        case "video":
          message.video = { url: URL };
          message.mimetype = "video/mp4";
          break;

        case "audio":
          message.audio = { url: URL };
          message.mimetype = "audio/mpeg";
          message.ptt = true; // Voice note style
          break;

        case "sticker":
          message.sticker = { url: URL };
          message.mimetype = "image/webp";
          delete message.caption;
          break;

        case "gif":
          message.video = { url: URL };
          message.gifPlayback = true;
          message.mimetype = "video/mp4";
          break;

        default:
          throw new Error("Unknown media type: " + type);
      }

      // Final check: remove any forward properties
      delete message.forward;

      console.log("📤 Sending media:", type, "URL:", URL);
      return await m.client.sendMessage(m.jid, message);
    } else {
      // Handle text message
      if (msg.includes("&sender")) {
        msg = msg.replace(/&sender/g, "@" + m.number);
        message.contextInfo.mentionedJid = [m.sender];
      }

      message.text = msg || "Hello!";

      // Final check: ensure no forward flag
      delete message.forward;

      return await m.client.sendMessage(m.jid, message);
    }
  } catch (error) {
    console.error("Mention function error:", error);
    // Fallback to simple text message
    try {
      await m.client.sendMessage(m.jid, {
        text: "Hey! Bot mentioned but error occurred 😅",
        contextInfo: {
          mentionedJid: [m.sender],
          isForwarded: false,
        },
      });
    } catch (fallbackError) {
      console.error("Fallback message failed:", fallbackError);
    }
  }
}

module.exports = {
  mention,
};
