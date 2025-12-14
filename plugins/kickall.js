// plugins/kickall.js
const { Module } = require("../lib/plugins");
const cache = require("../lib/group-cache");

Module({
    command: "kickall",
    package: "group",
    description: "Kick all non-admin users at once (no safety confirmation)",
})(async (message) => {
    await message.loadGroupInfo();
    if (!message.isGroup) return message.send("❌ Group only");
    if (!message.isAdmin && !message.isFromMe) return message.send("❌ Admin only");
    if (!message.isBotAdmin) return message.send("❌ Bot must be admin");
    const md = await cache.getGroupMetadata(message.conn, message.from);
    if (!md?.participants?.length)
        return message.send("❌ No participants found");
    const botJid = message.conn.user.lid.split(":")[0] + "@lid";
    const targets = md.participants
        .filter(p => !p.admin)
        .map(p => p.id)
        .filter(jid => jid !== botJid);

    if (!targets.length)
        return message.send("✅ No non-admin users");
    await message.client.groupParticipantsUpdate(
        message.from,
        targets,
        "remove"
    );
    const remaining = md.participants.filter(p => p.admin);
    cache.setCached(message.from, { ...md, participants: remaining });
    await message.send(`✅ Kicked ${targets.length} users in ONE action`);
});