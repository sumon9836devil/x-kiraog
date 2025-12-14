const { Module } = require("../lib/plugins");
const warn = require("../lib/warn");
const theme = require("../Themes/themes").getTheme();

Module({
  command: "warn",
  package: "group",
  description: "Warn a user",
})(async (message) => {
  await message.loadGroupInfo();
  if (!message.isGroup) return message.send(theme.isGroup);
  if (!message.isAdmin && !message.isFromMe) return message.send(theme.isAdmin);

  const target =
    message.mentionedJid?.[0] ||
    message.reply_message?.sender;

  if (!target) return message.send("*_Reply or mention a user_*");

  const res = await warn.addWarn(message.from, target, {
    reason: "manual",
    by: message.sender
  });

  if (res.reached) {
    await message.send(`❌ Warn limit reached. User will be removed.`);
    await message.client.groupParticipantsUpdate(
      message.from,
      [target],
      "remove"
    );
  } else {
      await message.send(
    `⚠️ Warning given\n\n` +
    `User: @${target.split("@")[0]}\n` +
    `Warn: ${res.count}/${res.limit}`,
    { mentions: [target] }
  );
    return;
  }
});


Module({
  command: "rmwarn",
  package: "group",
  description: "Remove a warning from a user",
})(async (message) => {
  await message.loadGroupInfo();

  if (!message.isGroup) return message.send(theme.isGroup);
  if (!message.isAdmin && !message.isFromMe)
    return message.send(theme.isAdmin);

  const target =
    message.mentionedJid?.[0] ||
    message.reply_message?.sender;

  if (!target)
    return message.send("*_Reply to a user or mention someone_*");
  const current = await warn.getWarnCount(message.from, target);

  if (!current || current < 1) {
    return message.send(
      `ℹ️ User @${target.split("@")[0]} has no warnings.`,
      { mentions: [target] }
    );
  }
  // ➖ Remove one warn
  const newCount = await warn.removeWarn(message.from, target);
  return message.send(
    `✅ Warning removed\n\n` +
      `User: @${target.split("@")[0]}\n` +
      `Warns left: ${newCount}`,
    { mentions: [target] }
  );
});

Module({
  command: "warnlimit",
  package: "group",
  description: "Set warn limit",
})(async (message, match) => {
  await message.loadGroupInfo();
  if (!message.isGroup) return;
  if (!message.isAdmin && !message.isFromMe) return;

  const limit = parseInt(match);
  if (!limit || limit < 1 || limit > 10)
    return message.send("*_Limit must be between 1-10_*");

  await warn.setWarnLimit(message.from, limit);
  return message.send(`✅ Warn limit set to ${limit}`);
});

Module({
  command: "warnlist",
  package: "group",
  description: "List warns",
})(async (message) => {
  await message.loadGroupInfo();
  if (!message.isGroup) return;

  const data = await warn.listWarns(message.from);
  if (!Object.keys(data.users).length)
    return message.send("*_No warnings in this group_*");

  let text = `⚠️ *Warn List* (Limit: ${data.limit})\n\n`;
  for (const jid in data.users) {
    text += `@${jid.split("@")[0]} → ${data.users[jid].count}\n`;
  }

  return message.send(text, {
    mentions: Object.keys(data.users)
  });
});