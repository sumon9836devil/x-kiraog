// lib/mention.js
function MediaUrls(text) {
  let array = [];
  const regexp =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()'@:%_\+.~#?!&//=]*)/gi;
  let urls = text.match(regexp);
  if (urls) {
    urls.map((url) => {
      if (
        ["jpg", "jpeg", "png", "gif", "mp4", "webp", "mp3", "m4a", "ogg", "wav"].includes(
          url.split(".").pop().toLowerCase()
        )
      ) {
        array.push(url);
      }
    });
    return array.length ? array : false;
  } else {
    return false;
  }
}

function extractLastJsonBlock(s = "") {
  for (let i = s.lastIndexOf("{"); i !== -1; i = s.lastIndexOf("{", i - 1)) {
    const maybe = s.slice(i);
    try {
      const parsed = JSON.parse(maybe);
      const textWithoutJson = s.slice(0, i).trim();
      return { json: parsed, textWithoutJson };
    } catch (e) {
      // try earlier {
    }
  }
  return { json: null, textWithoutJson: s };
}

function buildMentionList(text, m) {
  const mentions = new Set();
  if (text.includes("&sender")) {
    const number = m.sender.split("@")[0];
    text = text.replace(/&sender/g, "@" + number);
    mentions.add(m.sender);
  }
  const atMatches = [...text.matchAll(/@(\d{5,})/g)];
  for (const mm of atMatches) {
    const num = mm[1];
    mentions.add(`${num}@s.whatsapp.net`);
  }
  return { text, mentionedJids: Array.from(mentions) };
}

function deepClone(o) {
  try {
    return JSON.parse(JSON.stringify(o));
  } catch {
    return o;
  }
}

function normalizeExternalAdReply(ear = {}) {
  const copy = { ...ear };

  // If caller passed a thumbnail URL string (http/https), move it into thumbnailUrl
  if (typeof copy.thumbnail === "string" && /^https?:\/\//i.test(copy.thumbnail)) {
    // move to thumbnailUrl and remove thumbnail to avoid protobuf trying to decode it as bytes
    copy.thumbnailUrl = copy.thumbnail;
    delete copy.thumbnail;
  }

  // If there's a thumbnailUrl but still a thumbnail key (empty or non-url), remove the thumbnail key
  if (copy.thumbnail && typeof copy.thumbnail === "string" && !/^data:|^https?:\/\//i.test(copy.thumbnail)) {
    // if it looks like base64 data (data:...), keep it; otherwise delete to avoid decode errors
    if (!/^data:/i.test(copy.thumbnail)) delete copy.thumbnail;
  }

  // If mediaUrl exists and thumbnailUrl not provided but thumbnail field was a URL earlier, we already moved it.
  // Ensure we don't pass any non-base64 string into fields that expect bytes.
  return copy;
}

async function mention(m, text = "") {
  try {
    if (!m || !m.client) throw new Error("Missing 'm' or 'm.client'");
    const types = ["type/image", "type/video", "type/audio", "type/sticker", "type/gif"];
    const { json: parsedJson, textWithoutJson } = extractLastJsonBlock(text || "");
    let msg = (textWithoutJson || text || "").trim();

    let message = {
      contextInfo: {
        mentionedJid: [m.sender],
        isForwarded: false,
        forwardingScore: 0,
      },
    };

    // Helper: apply forwarding flags based on parsedJson if provided, otherwise default to false/0
    const setForwardingFlags = (ctxInfo) => {
      if (!ctxInfo) return;
      // always remove newsletter info (we don't want that)
      delete ctxInfo.forwardedNewsletterMessageInfo;

      // Prefer value from parsedJson.contextInfo, then parsedJson top-level
      const providedIsForwarded =
        parsedJson && parsedJson.contextInfo && typeof parsedJson.contextInfo.isForwarded !== "undefined"
          ? parsedJson.contextInfo.isForwarded
          : parsedJson && typeof parsedJson.isForwarded !== "undefined"
          ? parsedJson.isForwarded
          : undefined;

      const providedScore =
        parsedJson && parsedJson.contextInfo && typeof parsedJson.contextInfo.forwardingScore !== "undefined"
          ? parsedJson.contextInfo.forwardingScore
          : parsedJson && typeof parsedJson.forwardingScore !== "undefined"
          ? parsedJson.forwardingScore
          : undefined;

      if (typeof providedIsForwarded !== "undefined") ctxInfo.isForwarded = providedIsForwarded;
      else ctxInfo.isForwarded = false;

      if (typeof providedScore !== "undefined") ctxInfo.forwardingScore = providedScore;
      else ctxInfo.forwardingScore = 0;
    };

    if (parsedJson) {
      // preserve explicit ptt/mimetype/waveform exactly if provided
      if (Object.prototype.hasOwnProperty.call(parsedJson, "ptt")) message.ptt = parsedJson.ptt;
      if (Object.prototype.hasOwnProperty.call(parsedJson, "mimetype")) message.mimetype = parsedJson.mimetype;
      if (parsedJson.waveform) message.waveform = parsedJson.waveform;

      // merge contextInfo carefully
      if (parsedJson.contextInfo) {
        message.contextInfo = { ...(message.contextInfo || {}), ...parsedJson.contextInfo };

        // Normalize externalAdReply to avoid passing URLs into binary fields
        if (message.contextInfo.externalAdReply) {
          message.contextInfo.externalAdReply = normalizeExternalAdReply(message.contextInfo.externalAdReply);
        }

        // If mentionedJid array provided, merge
        if (Array.isArray(parsedJson.contextInfo.mentionedJid)) {
          message.contextInfo.mentionedJid = Array.from(
            new Set([...(message.contextInfo.mentionedJid || []), ...parsedJson.contextInfo.mentionedJid])
          );
        }
      }

      // Also normalize top-level externalAdReply if present (rare)
      if (parsedJson.externalAdReply) {
        parsedJson.externalAdReply = normalizeExternalAdReply(parsedJson.externalAdReply);
        // merge into contextInfo.externalAdReply if needed
        message.contextInfo = message.contextInfo || {};
        message.contextInfo.externalAdReply = { ...(message.contextInfo.externalAdReply || {}), ...parsedJson.externalAdReply };
      }

      // Apply forwarding flags now (will respect parsedJson.isForwarded or parsedJson.contextInfo.isForwarded)
      setForwardingFlags(message.contextInfo);
    } else {
      // no parsedJson — ensure defaults are applied
      setForwardingFlags(message.contextInfo);
    }

    // detect type token
    let type = "text";
    for (const t of types) {
      if (msg.includes(t)) {
        type = t.replace("type/", "");
        break;
      }
    }

    const { text: withMentionsReplaced, mentionedJids } = buildMentionList(msg, m);
    msg = withMentionsReplaced;
    if (message.contextInfo?.mentionedJid && Array.isArray(message.contextInfo.mentionedJid)) {
      message.contextInfo.mentionedJid = Array.from(new Set([...message.contextInfo.mentionedJid, ...mentionedJids]));
    } else if (mentionedJids.length) {
      message.contextInfo = message.contextInfo || {};
      message.contextInfo.mentionedJid = mentionedJids;
    }

    let URLS = MediaUrls(msg || "");

    const pickUrlForType = (desiredType) => {
      if (!URLS) URLS = false;
      if (URLS && URLS.length) {
        const audioExt = /\.(mp3|m4a|ogg|opus|wav|aac)(\?|$)/i;
        const videoExt = /\.(mp4|mkv|mov|webm)(\?|$)/i;
        const imageExt = /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i;
        let filtered = [];
        if (desiredType === "audio") filtered = URLS.filter(u => audioExt.test(u));
        else if (desiredType === "video") filtered = URLS.filter(u => videoExt.test(u));
        else if (desiredType === "image" || desiredType === "sticker") filtered = URLS.filter(u => imageExt.test(u));
        if (filtered.length) return filtered[Math.floor(Math.random() * filtered.length)];
      }
      const earMedia = parsedJson?.contextInfo?.externalAdReply?.mediaUrl
                    || parsedJson?.contextInfo?.externalAdReply?.thumbnailUrl
                    || parsedJson?.mediaUrl;
      if (earMedia) return earMedia;
      if (URLS && URLS.length) return URLS[Math.floor(Math.random() * URLS.length)];
      return null;
    };

    if (type !== "text") {
      if (URLS && URLS.length) for (const u of URLS) msg = msg.replace(u, "");
      msg = msg.replace("type/", "").replace(type, "").replace(/,/g, "").trim();

      const URL = pickUrlForType(type);
      if (msg) message.caption = msg;

      const attachMediaMeta = (mediaObj = {}) => {
        if (message.mimetype) mediaObj.mimetype = message.mimetype;
        if (Object.prototype.hasOwnProperty.call(message, "ptt")) mediaObj.ptt = message.ptt;
        if (message.waveform) mediaObj.waveform = message.waveform;
        if (message.contextInfo) mediaObj.contextInfo = deepClone(message.contextInfo);
        return mediaObj;
      };

      switch (type) {
        case "image":
          if (!URL) throw new Error("No image URL found");
          message.image = attachMediaMeta({ url: URL });
          message.mimetype = message.mimetype || "image/jpeg";
          break;
        case "video":
          if (!URL) throw new Error("No video URL found");
          message.video = attachMediaMeta({ url: URL });
          message.mimetype = message.mimetype || "video/mp4";
          break;
        case "audio":
          if (!Object.prototype.hasOwnProperty.call(message, "ptt")) message.ptt = true;
          message.mimetype = message.mimetype || "audio/mpeg";
          if (!URL) throw new Error("No audio URL found");
          message.audio = attachMediaMeta({ url: URL });
          break;
        case "sticker":
          if (!URL) throw new Error("No sticker URL found");
          message.sticker = attachMediaMeta({ url: URL });
          message.mimetype = message.mimetype || "image/webp";
          delete message.caption;
          if (!parsedJson?.contextInfo) delete message.contextInfo;
          break;
        case "gif":
          if (!URL) throw new Error("No gif URL found");
          message.video = attachMediaMeta({ url: URL });
          message.gifPlayback = true;
          message.mimetype = message.mimetype || "video/mp4";
          break;
        default:
          throw new Error("Unknown media type: " + type);
      }

      delete message.forward;
      // respect provided forwarding flags (re-apply just in case)
      if (message.contextInfo) setForwardingFlags(message.contextInfo);

      // DEBUG
      try { console.log("[mention] final message object being sent:", JSON.stringify(message, null, 2)); } catch (e) {}

      return await m.client.sendMessage(m.jid, message);
    }

    // Text flow
    if (!message.text) message.text = msg || message.caption || "Hello!";
    if (message.text.includes("@") && (!message.contextInfo || !message.contextInfo.mentionedJid)) {
      const { mentionedJids: auto } = buildMentionList(message.text, m);
      if (auto.length) {
        message.contextInfo = message.contextInfo || {};
        message.contextInfo.mentionedJid = Array.from(new Set([...(message.contextInfo.mentionedJid || []), ...auto]));
      }
    }

    delete message.forward;
    // re-apply/ensure correct forwarding flags for text messages as well
    if (message.contextInfo) setForwardingFlags(message.contextInfo);

    try { console.log("[mention] final text message object:", JSON.stringify(message, null, 2)); } catch (e) {}
    return await m.client.sendMessage(m.jid, message);
  } catch (error) {
    console.error("Mention function error:", error);
    try {
      await m.client.sendMessage(m.jid, {
        text: (text || "").substring(0, 300),
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

module.exports = mention;