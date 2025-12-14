
const { Module } = require("../lib/plugins");
const settings = require("../lib/database/settingdb"); // adjust path if needed
const warnlib = require("../lib/warn"); // must implement addWarn/removeWarn/setWarnLimit
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// fast detection patterns (compiled once)
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s]+)/gi;
const DOMAIN_REGEX = /\b([A-Za-z0-9\-]+\.[A-Za-z]{2,}(?:\/[^\s]*)?)\b/gi;

// default config
function defaultConfig() {
    return {
        status: true,
        action: "kick", // kick | warn | null
        not_del: []
    };
}

function toBool(v) {
    if (v === true || v === 1) return true;
    if (v === false || v === 0) return false;
    if (typeof v === "string") return ["true", "1", "yes", "on"].includes(v.toLowerCase());
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

function detectLinks(text) {
    if (!text) return [];
    const found = new Set();

    let m;
    while ((m = URL_REGEX.exec(text))) {
        if (m[1]) found.add(m[1]);
    }
    // domain-like fallback
    while ((m = DOMAIN_REGEX.exec(text))) {
        const candidate = m[1];
        if (!candidate) continue;
        if (candidate.includes("@")) continue; // skip emails
        // avoid duplicates
        let dup = false;
        for (const s of found) if (s.includes(candidate) || candidate.includes(s)) { dup = true; break; }
        if (!dup) found.add(candidate);
    }

    return Array.from(found);
}

// Core enforcement: delete first, then act
async function enforceMessage(message) {
    try {
        if (!message || !message.isGroup) return { acted: false };

        // quick short-circuit: if no dot / no www/http then probably no link
        const body = (message.body || "").toString();
        if (!body || (body.indexOf('.') === -1 && body.indexOf('http') === -1 && body.indexOf('www') === -1)) {
            return { acted: false };
        }

        const links = detectLinks(body);
        if (!links.length) return { acted: false };

        // load cfg
        let cfg = await settings.getGroup(message.from, "link");
        cfg = normalizeCfg(cfg);

        if (!toBool(cfg.status)) return { acted: false };

        // ensure group info available for admin checks
        if (typeof message.isAdmin === "undefined" || typeof message.isBotAdmin === "undefined") {
            try { await message.loadGroupInfo(); } catch (e) { }
        }

        // ignore admins and bot self
        if (message.isAdmin || message.isFromMe || message.isBotAdmin) return { acted: false };

        // pick first offending link not in ignore list
        let offenderUrl = null;
        for (const l of links) {
            if (!isIgnored(l, cfg.not_del)) { offenderUrl = l; break; }
        }
        if (!offenderUrl) return { acted: false };

        const offender = message.sender;
        const client = message.client || message.conn;

        // 1) Try delete message for everyone if possible (best effort)
        try {
            if (client && message.key && message.isBotAdmin) {
                await client.sendMessage(message.from, { delete: message.key }).catch(() => { });
            } else if (client && message.key) {
                // still try (may fail silently)
                await client.sendMessage(message.from, { delete: message.key }).catch(() => { });
            }
        } catch (e) {
            // ignore deletion errors
        }

        const action = (cfg.action || "kick").toLowerCase();

        // NULL => only delete (we already attempted delete)
        if (action === "null") {
            return { acted: true, action: "null", offender, url: offenderUrl };
        }

        // WARN => add warn via warnlib
        if (action === "warn") {
            const res = await warnlib.addWarn(message.from, offender, {
                reason: "antilink",
                by: message.sender || "system"
            });

            try {
                await message.send(
                    `⚠️ *Anti-Link Warning*\n\nUser: @${offender.split("@")[0]}\nWarn: ${res.count}/${res.limit}`,
                    { mentions: [offender] }
                );
            } catch (e) { }

            if (res.reached) {
                // kick & clear warns
                try {
                    if (client) {
                        await client.groupParticipantsUpdate(message.from, [offender], "remove");
                    }
                } catch (e) {
                    console.error("antilink: failed to kick after warn limit:", e);
                }
                await warnlib.removeWarn(message.from, offender).catch(() => { });
                try {
                    await message.send(`🚫 @${offender.split("@")[0]} removed — warn limit reached.`, { mentions: [offender] });
                } catch (e) { }
                return { acted: true, action: "warn-kick", offender, url: offenderUrl };
            }

            return { acted: true, action: "warn", offender, url: offenderUrl, warnInfo: res };
        }

        // KICK => immediate removal
        if (action === "kick") {
            try {
                if (client) {
                    // optional notify
                    try {
                        await message.send(`❌ *Anti-Link Detected*\nUser removed: @${offender.split("@")[0]}`, { mentions: [offender] }).catch(() => { });
                    } catch (e) { }
                    await client.groupParticipantsUpdate(message.from, [offender], "remove");
                }
            } catch (err) {
                console.error("antilink kick error:", err);
                return { acted: false, error: err };
            }
            await warnlib.removeWarn(message.from, offender).catch(() => { });
            return { acted: true, action: "kick", offender, url: offenderUrl };
        }

        return { acted: false };
    } catch (err) {
        console.error("antilink.enforceMessage error:", err);
        return { acted: false, error: err };
    }
}

// =================== Command handler ===================
Module({
    command: "antilink",
    package: "group",
    description: "Manage anti-link settings",
})(async (message, match) => {
    await message.loadGroupInfo();
    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe) return message.send(theme.isAdmin);

    const raw = (match || "").trim();
    const lower = raw.toLowerCase();

    let cfg = await settings.getGroup(message.from, "link");
    cfg = normalizeCfg(cfg);

    if (!raw) {
        return await message.sendreply(
            `*Antilink Settings*\n\n` +
            `• Status: ${toBool(cfg.status) ? "✅ ON" : "❌ OFF"}\n` +
            `• Action: ${cfg.action}\n` +
            `• Ignore (not_del): ${cfg.not_del.length ? cfg.not_del.join(", ") : "None"}\n\n` +
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

    // on / off
    if (lower === "on" || lower === "off") {
        cfg.status = lower === "on";
        await settings.setGroupPlugin(message.from, "link", cfg);
        await message.react("✅");
        return await message.send(cfg.status ? "✅ Antilink enabled" : "❌ Antilink disabled");
    }

    // action
    if (lower.startsWith("action")) {
        const val = raw.replace(/action/i, "").trim().toLowerCase();
        if (!["kick", "warn", "null"].includes(val)) {
            await message.react("❌");
            return await message.send("Invalid action. Use: kick | warn | null");
        }
        cfg.action = val;
        await settings.setGroupPlugin(message.from, "link", cfg);
        await message.react("✅");
        return await message.send(`⚙️ Antilink action set to *${val}*`);
    }

    // set_warn => change group-level warn limit
    if (lower.startsWith("set_warn")) {
        const num = parseInt(raw.replace(/set_warn/i, "").trim());
        if (isNaN(num) || num < 1 || num > 50) {
            await message.react("❌");
            return await message.send("Provide a valid number between 1 and 50");
        }
        await warnlib.setWarnLimit(message.from, num);
        await message.react("✅");
        return await message.send(`✅ Warn limit set to ${num}`);
    }

    // not_del subcommands
    if (lower.startsWith("not_del")) {
        const tail = raw.replace(/not_del/i, "").trim();
        if (!tail) {
            await message.react("❌");
            return await message.send("Usage: not_del add <url> | not_del remove <url> | not_del list");
        }
        const [sub, ...rest] = tail.split(/\s+/);
        const payload = rest.join(" ").trim();
        if (sub === "add") {
            if (!payload) {
                await message.react("❌");
                return await message.send("Provide a URL or domain to add");
            }
            if (!payload.includes(".") && !/^https?:\/\//i.test(payload) && !/^www\./i.test(payload)) {
                await message.react("❌");
                return await message.send("Please provide a valid URL or domain (e.g. example.com or https://example.com)");
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
            cfg.not_del = (cfg.not_del || []).filter(x => x.toLowerCase() !== payload.toLowerCase());
            await settings.setGroupPlugin(message.from, "link", cfg);
            await message.react("✅");
            return await message.send("✅ URL/domain removed from ignore list");
        } else if (sub === "list") {
            await message.react("✅");
            return await message.send(`Ignored patterns:\n${cfg.not_del.length ? cfg.not_del.join("\n") : "None"}`);
        } else {
            await message.react("❌");
            return await message.send("Invalid not_del subcommand. Use add/remove/list");
        }
    }

    // reset
    if (lower === "reset") {
        cfg = defaultConfig();
        await settings.setGroupPlugin(message.from, "link", cfg);
        await message.react("✅");
        return await message.send("♻️ Antilink settings reset to defaults (enabled, action: kick)");
    }

    // fallback
    await message.react("❌");
    return await message.send("Invalid command. Type `antilink` to see help");
});

// Auto-enforce on every text message (fast)
Module({ on: "text" })(async (message) => {
    try {
        await enforceMessage(message);
    } catch (e) {
        console.error("antilink auto error:", e);
    }
});
