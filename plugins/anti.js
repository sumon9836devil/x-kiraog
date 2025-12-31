// plugins/antilink.js
const { Module } = require("../lib/plugins");
const settings = require("../lib/database/settingdb");
const warnlib = require("./bin/warnlib"); // addWarn/removeWarn/setWarnLimit
const { getTheme } = require("../Themes/themes");
const theme = getTheme();
const DEBUG = 1;

// ---------------- regexes & helpers ----------------
// explicit URL forms: http(s)://, ftp://, www.
const URL_REGEX = /((?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`)\]]+)/gi;

// improved domain-like fallback (supports multi-level TLDs and path)
const DOMAIN_REGEX =
  /\b(?!\d+\b)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})(?:\/[^\s<>"'`)\]]*)?)\b/gi;

// detect markdown links: [text](https://example.com)
const MD_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;

// common shorteners patterns (t.co, bit.ly, tinyurl, goo.gl, youtu.be etc.)
const SHORTENER_HOSTS = [
  "t.co",
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "youtu.be",
  "is.gd",
  "ow.ly",
  "buff.ly",
  "rb.gy",
];

// normalize obfuscated dot forms: example[.]com, example(.)com, example dot com
function deobfuscateDots(s) {
  if (!s || typeof s !== "string") return s;
  // common variants
  return s
    .replace(/\[\s*\.\s*\]/g, ".")
    .replace(/\(\s*\.\s*\)/g, ".")
    .replace(/\s+\.\s+/g, ".")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".");
}

// trim wrapper punctuation and angle brackets
function normalizeCandidate(s) {
  if (!s || typeof s !== "string") return s;
  return s.trim().replace(/^[<\s"'\(`\[{}]+|[>\s\)\]"'\.,:;!?]+$/g, "");
}

// quick check to see if host looks like a real TLD-based host (very permissive)
function looksLikeDomain(s) {
  try {
    if (!s || typeof s !== "string") return false;
    const tmp = s.toLowerCase().trim();
    // if it starts with protocol it's fine
    if (
      /^https?:\/\//i.test(tmp) ||
      /^ftp:\/\//i.test(tmp) ||
      /^www\./i.test(tmp)
    )
      return true;
    // contains at least one dot and a 2+ char tld
    return /\.[a-z]{2,}(?:[\/:]|$)/i.test(tmp);
  } catch (e) {
    return false;
  }
}

// ---------------- config helpers ----------------
function defaultConfig() {
  return { status: true, action: "kick", not_del: [] };
}
function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string")
    return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return Boolean(v);
}
function normalizeCfg(raw) {
  if (!raw || typeof raw !== "object") return defaultConfig();
  const cfg = { ...defaultConfig(), ...raw };
  cfg.not_del = Array.isArray(cfg.not_del) ? cfg.not_del : [];
  cfg.action = (cfg.action || "kick").toLowerCase();
  return cfg;
}
function isIgnored(link, notDelList = []) {
  if (!link) return false;
  const l = link.toLowerCase();
  for (const p of notDelList || []) {
    if (!p) continue;
    const q = p.toLowerCase().trim();
    if (!q) continue;
    if (l.includes(q)) return true;
  }
  return false;
}

// ---------------- extraction helpers ----------------
function extractText(message) {
  if (!message) return "";
  // quick tries for common well-known properties
  if (typeof message.body === "string" && message.body.trim())
    return message.body.trim();
  if (typeof message.content === "string" && message.content.trim())
    return message.content.trim();
  if (typeof message.text === "string" && message.text.trim())
    return message.text.trim();
  if (typeof message.caption === "string" && message.caption.trim())
    return message.caption.trim();

  try {
    const mroot =
      message.message ||
      message.msg ||
      (message.raw && message.raw.message) ||
      {};
    if (typeof mroot.conversation === "string" && mroot.conversation.trim())
      return mroot.conversation.trim();
    if (
      mroot.extendedTextMessage &&
      typeof mroot.extendedTextMessage.text === "string" &&
      mroot.extendedTextMessage.text.trim()
    ) {
      return mroot.extendedTextMessage.text.trim();
    }
    if (
      mroot.imageMessage &&
      typeof mroot.imageMessage.caption === "string" &&
      mroot.imageMessage.caption.trim()
    )
      return mroot.imageMessage.caption.trim();
    if (
      mroot.videoMessage &&
      typeof mroot.videoMessage.caption === "string" &&
      mroot.videoMessage.caption.trim()
    )
      return mroot.videoMessage.caption.trim();
    if (
      mroot.templateButtonReplyMessage &&
      typeof mroot.templateButtonReplyMessage.selectedId === "string"
    )
      return mroot.templateButtonReplyMessage.selectedId;
    if (
      mroot.buttonsResponseMessage &&
      typeof mroot.buttonsResponseMessage.selectedDisplayText === "string"
    )
      return mroot.buttonsResponseMessage.selectedDisplayText;

    // scan nested keys for any string-like content
    for (const k of Object.keys(mroot)) {
      try {
        const ct = mroot[k];
        if (!ct) continue;
        if (typeof ct === "string" && ct.trim()) return ct.trim();
        if (ct && typeof ct.text === "string" && ct.text.trim())
          return ct.text.trim();
        if (ct && typeof ct.caption === "string" && ct.caption.trim())
          return ct.caption.trim();
        if (ct && typeof ct.conversation === "string" && ct.conversation.trim())
          return ct.conversation.trim();
      } catch (e) {
        // ignore inner
      }
    }
  } catch (e) {
    if (DEBUG)
      console.debug(
        "[antilink] extractText error:",
        e && e.message ? e.message : e
      );
  }
  return "";
}

// ---------------- detection ----------------
function detectLinks(text) {
  if (!text || typeof text !== "string") return [];
  const found = new Set();
  let m;

  // 1) markdown links (highest confidence) - capture the link target
  while ((m = MD_LINK_REGEX.exec(text))) {
    const url = normalizeCandidate(m[2]);
    if (url) {
      const de = deobfuscateDots(url);
      if (looksLikeDomain(de)) {
        if (DEBUG) console.debug("[antilink] md-link found:", url);
        found.add(de);
      }
    }
  }

  // 2) explicit URL matches (http/https/ftp/www)
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(text))) {
    let cand = normalizeCandidate(m[1]);
    cand = deobfuscateDots(cand);
    if (!cand) continue;
    // remove trailing punctuation leftovers
    cand = cand.replace(/[).,;!?:]+$/g, "");
    if (looksLikeDomain(cand)) {
      if (DEBUG) console.debug("[antilink] explicit URL found:", cand);
      found.add(cand);
    }
  }

  // 3) domain-like fallback (naked domains like example.com or example.co.uk/path) but avoid emails and numbers
  DOMAIN_REGEX.lastIndex = 0;
  while ((m = DOMAIN_REGEX.exec(text))) {
    let cand = normalizeCandidate(m[1]);
    if (!cand) continue;
    cand = deobfuscateDots(cand);
    if (cand.includes("@")) continue; // skip emails
    // ignore single words that are not domain-like
    if (!looksLikeDomain(cand)) continue;
    // avoid duplicates/substrings
    let dup = false;
    for (const s of found) {
      if (s === cand || s.includes(cand) || cand.includes(s)) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      if (DEBUG) console.debug("[antilink] domain-like found:", cand);
      found.add(cand);
    }
  }

  // 4) catch obfuscated forms like "example[.]com" that might not have been matched above
  // (we do a second pass replacing common obfuscations and testing)
  const deob = deobfuscateDots(text);
  if (deob !== text) {
    DOMAIN_REGEX.lastIndex = 0;
    while ((m = DOMAIN_REGEX.exec(deob))) {
      let cand = normalizeCandidate(m[1]);
      if (!cand) continue;
      if (cand.includes("@")) continue;
      if (!looksLikeDomain(cand)) continue;
      let dup = false;
      for (const s of found) {
        if (s === cand || s.includes(cand) || cand.includes(s)) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        if (DEBUG) console.debug("[antilink] deobfuscated domain found:", cand);
        found.add(cand);
      }
    }
  }

  // convert set -> array and return
  return Array.from(found);
}

// ---------------- API compatibility helpers ----------------
function getSender(message) {
  return (
    message.sender ||
    (message.key && message.key.participant) ||
    (message.key && message.key.remoteJid) ||
    message.from ||
    message.participant ||
    null
  );
}

async function safeDelete(message, client) {
  try {
    if (typeof message.delete === "function") {
      await message.delete().catch(() => {});
      if (DEBUG) console.debug("[antilink] message.delete() called");
      return;
    }
    if (message.key && client && typeof client.sendMessage === "function") {
      await client
        .sendMessage(message.from || message.key.remoteJid || message.jid, {
          delete: message.key,
        })
        .catch(() => {});
      if (DEBUG)
        console.debug(
          "[antilink] client.sendMessage(..., {delete: key}) attempted"
        );
      return;
    }
    if (
      client &&
      typeof client.deleteMessage === "function" &&
      message.from &&
      message.key
    ) {
      await client.deleteMessage(message.from, message.key).catch(() => {});
      if (DEBUG) console.debug("[antilink] client.deleteMessage called");
      return;
    }
  } catch (e) {
    if (DEBUG)
      console.debug(
        "[antilink] safeDelete error:",
        e && e.message ? e.message : e
      );
  }
}

async function safeKick(groupJid, jid, client, message) {
  try {
    if (client && typeof client.groupParticipantsUpdate === "function") {
      await client.groupParticipantsUpdate(groupJid, [jid], "remove");
      await warnlib.removeWarn(message.from, jid);
      if (DEBUG)
        console.debug("[antilink] groupParticipantsUpdate remove", jid);
      return true;
    }
    if (typeof message.removeParticipant === "function") {
      await message.removeParticipant(jid);
      await warnlib.removeWarn(message.from, jid);
      if (DEBUG) console.debug("[antilink] message.removeParticipant", jid);
      return true;
    }
  } catch (e) {
    if (DEBUG)
      console.debug(
        "[antilink] safeKick error:",
        e && e.message ? e.message : e
      );
  }
  if (DEBUG) console.debug("[antilink] safeKick not supported by client");
  return false;
}

async function safeReply(message, text, opts = {}) {
  try {
    if (typeof message.sendreply === "function") {
      await message.sendreply(text, opts).catch(() => {});
      if (DEBUG) console.debug("[antilink] sendreply used");
      return;
    }
    if (typeof message.reply === "function") {
      await message.reply(text, opts).catch(() => {});
      if (DEBUG) console.debug("[antilink] reply used");
      return;
    }
    if (typeof message.send === "function") {
      await message.send(text, opts).catch(() => {});
      if (DEBUG) console.debug("[antilink] send used");
      return;
    }
    if (message.client && typeof message.client.sendMessage === "function") {
      await message.client.sendMessage(message.from, { text }).catch(() => {});
      if (DEBUG) console.debug("[antilink] client.sendMessage fallback used");
      return;
    }
  } catch (e) {
    if (DEBUG)
      console.debug(
        "[antilink] safeReply error:",
        e && e.message ? e.message : e
      );
  }
}

// ---------------- core enforcement ----------------
async function enforceMessage(message) {
  try {
    if (!message || !message.isGroup) {
      if (DEBUG) console.debug("[antilink] skip: not a group");
      return { acted: false, reason: "not_group" };
    }
    message.loadGroupInfo();

    const preview =
      typeof message === "string"
        ? message
        : message.body || message.text || message.caption || "";
    if (DEBUG)
      console.debug(
        "[antilink] raw preview:",
        (preview || "").toString().slice(0, 200)
      );

    const body = extractText(message) || "";
    if (DEBUG) console.debug("[antilink] extracted body:", body.slice(0, 300));
    if (!body) {
      if (DEBUG) console.debug("[antilink] no text body -> nothing to do");
      return { acted: false, reason: "no_text" };
    }

    const links = detectLinks(body);
    if (DEBUG) console.debug("[antilink] detected links:", links);
    if (!links || !links.length)
      return { acted: false, reason: "no_detected_links" };

    // load config
    let cfg = await settings.getGroup(message.from, "link");
    cfg = normalizeCfg(cfg);
    if (DEBUG) console.debug("[antilink] group config:", cfg);
    if (!toBool(cfg.status)) {
      if (DEBUG) console.debug("[antilink] plugin disabled in group settings");
      return { acted: false, reason: "disabled_in_settings" };
    }
    if (message.isAdmin) {
      if (DEBUG) console.debug("[antilink] author is admin -> ignore");
      return { acted: false, reason: "ignored_admin" };
    }

    if (message.isFromMe) {
      if (DEBUG) console.debug("[antilink] message from bot -> ignore");
      return { acted: false, reason: "ignored_self" };
    }

    if (!message.isBotAdmin) {
      if (DEBUG) console.debug("[antilink] bot is not admin -> ignore");
      return { acted: false, reason: "bot_not_admin" };
    }

    if (DEBUG) console.debug("[antilink] conditions passed -> continue action");

    let offenderUrl = null;
    for (const l of links) {
      if (!isIgnored(l, cfg.not_del)) {
        offenderUrl = l;
        break;
      }
    }
    if (!offenderUrl) {
      if (DEBUG)
        console.debug("[antilink] all detected links are in ignore list");
      return { acted: false, reason: "all_ignored" };
    }

    const offender = getSender(message);
    const client = message.client || message.conn;
    if (DEBUG)
      console.debug(
        `[antilink] offender=${offender} url=${offenderUrl} action=${cfg.action}`
      );

    try {
      await safeDelete(message, client);
    } catch (e) {
      if (DEBUG)
        console.debug(
          "[antilink] delete attempt error:",
          e && e.message ? e.message : e
        );
    }

    const action = (cfg.action || "kick").toLowerCase();

    if (action === "null" || action === "none") {
      if (DEBUG)
        console.debug("[antilink] action=null -> only deleted message");
      return { acted: true, action: "null", offender, url: offenderUrl };
    }

    if (action === "warn") {
      if (!warnlib || typeof warnlib.addWarn !== "function") {
        console.error("[antilink] warnlib.addWarn missing");
        return { acted: false, error: "warnlib_missing" };
      }
      const info = await warnlib
        .addWarn(message.from, offender, {
          reason: "antilink",
          by: offender || "system",
        })
        .catch((err) => {
          console.error("[antilink] warnlib.addWarn error:", err);
          return null;
        });
      if (!info) return { acted: false, error: "warn_failed" };

      if (DEBUG) console.debug("[antilink] warn result:", info);
      try {
        await safeReply(
          message,
          `⚠️ *Anti-Link Warning*\n\nUser: @${
            (offender || "unknown").split("@")[0]
          }\nWarn: ${info.count}/${info.limit}`,
          { mentions: [offender] }
        );
      } catch (e) {
        if (DEBUG)
          console.debug(
            "[antilink] send warn reply failed:",
            e && e.message ? e.message : e
          );
      }

      if (info.reached) {
        try {
          const kicked = await safeKick(
            message.from,
            offender,
            client,
            message
          );
          if (!kicked)
            console.warn(
              "[antilink] kick after warn limit not supported by client"
            );
        } catch (e) {
          console.error("[antilink] failed to kick after warn limit:", e);
        }
        await warnlib.removeWarn(message.from, offender).catch(() => {});
        try {
          await safeReply(
            message,
            `🚫 @${
              (offender || "unknown").split("@")[0]
            } removed — warn limit reached.`,
            { mentions: [offender] }
          );
        } catch {}
        return { acted: true, action: "warn-kick", offender, url: offenderUrl };
      }
      return {
        acted: true,
        action: "warn",
        offender,
        url: offenderUrl,
        warnInfo: info,
      };
    }

    if (action === "kick") {
      try {
        try {
          await safeReply(
            message,
            `❌ *Anti-Link Detected*\nUser removed: @${
              (offender || "unknown").split("@")[0]
            }`,
            { mentions: [offender] }
          );
        } catch (e) {}
        const kicked = await safeKick(message.from, offender, client, message);
        if (!kicked) {
          console.warn("[antilink] cannot kick — client missing API");
          return { acted: false, error: "kick_not_supported" };
        }
      } catch (err) {
        console.error("antilink kick error:", err);
        return { acted: false, error: err };
      }
      if (warnlib && typeof warnlib.removeWarn === "function") {
        await warnlib.removeWarn(message.from, offender).catch(() => {});
      }
      return { acted: true, action: "kick", offender, url: offenderUrl };
    }

    if (DEBUG) console.debug("[antilink] unknown action:", action);
    return { acted: false, reason: "unknown_action" };
  } catch (err) {
    console.error("antilink.enforceMessage error:", err);
    return { acted: false, error: err };
  }
}

// ---------------- command handler (same commands as before) ----------------
Module({
  command: "antilink",
  package: "group",
  description: "Manage anti-link settings",
})(async (message, match) => {
  try {
    if (typeof message.loadGroupInfo === "function") {
      try {
        await message.loadGroupInfo();
      } catch (e) {
        if (DEBUG)
          console.debug(
            "antilink: loadGroupInfo failed:",
            e && e.message ? e.message : e
          );
      }
    }
    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe)
      return message.send(theme.isAdmin);

    const raw = (match || "").trim();
    const lower = raw.toLowerCase();
    let cfg = await settings.getGroup(message.from, "link");
    cfg = normalizeCfg(cfg);

    if (!raw) {
      return await message.sendreply(
        `*Antilink Settings*\n\n` +
          `• Status: ${toBool(cfg.status) ? "✅ ON" : "❌ OFF"}\n` +
          `• Action: ${cfg.action}\n` +
          `• Ignore (not_del): ${
            cfg.not_del.length ? cfg.not_del.join(", ") : "None"
          }\n\n` +
          `Commands:\n` +
          `• antilink on|off\n` +
          `• antilink action kick|warn|null\n` +
          `• antilink set_warn <number>\n` +
          `• antilink not_del add <url|domain>\n` +
          `• antilink not_del remove <url|domain>\n` +
          `• antilink not_del list\n` +
          `• antilink reset`
      );
    }

    if (lower === "on" || lower === "off") {
      cfg.status = lower === "on";
      await settings.setGroupPlugin(message.from, "link", cfg);
      await message.react("✅");
      return await message.send(
        cfg.status ? "✅ Antilink enabled" : "❌ Antilink disabled"
      );
    }

    if (lower.startsWith("action")) {
      const val = raw
        .replace(/action/i, "")
        .trim()
        .toLowerCase();
      if (!["kick", "warn", "null"].includes(val)) {
        await message.react("❌");
        return await message.send("Invalid action. Use: kick | warn | null");
      }
      cfg.action = val;
      await settings.setGroupPlugin(message.from, "link", cfg);
      await message.react("✅");
      return await message.send(`⚙️ Antilink action set to *${val}*`);
    }

    if (lower.startsWith("set_warn")) {
      const num = parseInt(raw.replace(/set_warn/i, "").trim());
      if (isNaN(num) || num < 1 || num > 50) {
        await message.react("❌");
        return await message.send("Provide a valid number between 1 and 50");
      }
      if (!warnlib || typeof warnlib.setWarnLimit !== "function") {
        await message.react("❌");
        return await message.send("Warnlib doesn't support setWarnLimit");
      }
      await warnlib.setWarnLimit(message.from, num);
      await message.react("✅");
      return await message.send(`✅ Warn limit set to ${num}`);
    }

    if (lower.startsWith("not_del")) {
      const tail = raw.replace(/not_del/i, "").trim();
      if (!tail) {
        await message.react("❌");
        return await message.send(
          "Usage: not_del add  | not_del remove  | not_del list"
        );
      }
      const [sub, ...rest] = tail.split(/\s+/);
      const payload = rest.join(" ").trim();

      if (sub === "add") {
        if (!payload) {
          await message.react("❌");
          return await message.send("Provide a URL or domain to add");
        }
        const ok = !!payload.match(/([a-z0-9-]+\.[a-z]{2,})|^(https?:\/\/)/i);
        if (!ok) {
          await message.react("❌");
          return await message.send(
            "Please provide a valid URL or domain (e.g. example.com or https://example.com)"
          );
        }
        if (!cfg.not_del.includes(payload)) cfg.not_del.push(payload);
        await settings.setGroupPlugin(message.from, "link", cfg);
        await message.react("✅");
        return await message.send("✅ URL/domain added to ignore list");
      } else if (sub === "remove") {
        if (!payload) {
          await message.react("❌");
          return await message.send("Provide a URL or domain to remove");
        }
        cfg.not_del = (cfg.not_del || []).filter(
          (x) => x.toLowerCase() !== payload.toLowerCase()
        );
        await settings.setGroupPlugin(message.from, "link", cfg);
        await message.react("✅");
        return await message.send("✅ URL/domain removed from ignore list");
      } else if (sub === "list") {
        await message.react("✅");
        return await message.send(
          `Ignored patterns:\n${
            cfg.not_del.length ? cfg.not_del.join("\n") : "None"
          }`
        );
      } else {
        await message.react("❌");
        return await message.send(
          "Invalid not_del subcommand. Use add/remove/list"
        );
      }
    }

    if (lower === "reset") {
      cfg = defaultConfig();
      await settings.setGroupPlugin(message.from, "link", cfg);
      await message.react("✅");
      return await message.send(
        "♻️ Antilink settings reset to defaults (enabled, action: kick)"
      );
    }

    await message.react("❌");
    return await message.send("Invalid command. Type `antilink` to see help");
  } catch (e) {
    console.error("antilink command handler error:", e);
    try {
      await message.send(
        "An error occurred while processing the antilink command."
      );
    } catch {}
  }
});

// automatically run on text messages
Module({ on: "text" })(async (message) => {
  try {
    await enforceMessage(message);
  } catch (e) {
    console.error("antilink auto error:", e);
  }
});
