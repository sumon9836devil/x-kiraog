const { Module } = require("../lib/plugins");
const { getTheme } = require("../Themes/themes");
const theme = getTheme();

// ==================== HELPER FUNCTIONS ====================

/**
 * Extract JID from message (mentions, quoted, or number)
 */
const extractJid = (message) => {
  if (message.quoted?.participant) return message.quoted.participant;
  if (message.mentions?.[0]) return message.mentions[0];
  const text = message.body.split(" ").slice(1).join(" ");
  const number = text.replace(/[^0-9]/g, "");
  return number ? `${number}@s.whatsapp.net` : null;
};

/**
 * Check permissions for group commands
 */
const checkPermissions = async (message) => {
  await message.loadGroupInfo();

  if (!message.isGroup) {
    await message.send(theme.isGroup);
    return false;
  }

  if (!message.isAdmin && !message.isFromMe) {
    await message.send(theme.isAdmin);
    return false;
  }

  if (!message.isBotAdmin) {
    await message.send(theme.isBotAdmin);
    return false;
  }

  return true;
};

// ==================== MEMBER MANAGEMENT ====================

Module({
  command: "add",
  package: "group",
  description: "Add member to group",
  usage: ".add <number|reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) {
      return message.send(
        "❌ _Provide user number, tag, or reply_\n\n*Example:*\n• .add 1234567890\n• .add @user\n• Reply to a message"
      );
    }

    await message.react("⏳");
    const res = await message.addParticipant(jid);
    const status = res?.[0]?.[jid]?.status || res?.[jid]?.status;
    const number = jid.split("@")[0];

    if (status === 200) {
      await message.react("✅");
      await message.send(
        `✅ *Member Added*\n\n@${number} has been added to the group`,
        {
          mentions: [jid],
        }
      );
    } else if (status === 403) {
      await message.react("⚠️");
      await message.send(
        `⚠️ *Cannot Add*\n\n@${number} has privacy settings that prevent being added to groups`,
        { mentions: [jid] }
      );
    } else if (status === 409) {
      await message.react("ℹ️");
      await message.send(`ℹ️ @${number} is already in this group`, {
        mentions: [jid],
      });
    } else {
      await message.react("❌");
      await message.send(
        `❌ Failed to add @${number}\n\n*Status Code:* ${status}`,
        {
          mentions: [jid],
        }
      );
    }
  } catch (error) {
    console.error("Add command error:", error);
    await message.react("❌");
    await message.send("❌ _An error occurred while adding member_");
  }
});

Module({
  command: "kick",
  package: "group",
  aliases: ["remove"],
  description: "Remove member from group",
  usage: ".kick <reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) {
      return message.send("❌ _Tag or reply to a user to kick_");
    }

    const botJid = message.conn.user.id.split(":")[0] + "@s.whatsapp.net";

    if (jid === botJid) {
      return message.send("❌ _Cannot kick myself_");
    }

    if (jid === message.groupOwner) {
      return message.send("❌ _Cannot kick the group owner_");
    }

    if (message.groupAdmins.includes(jid) && !message.isFromMe) {
      return message.send("❌ _Cannot kick other admins_");
    }

    await message.react("⏳");
    await message.removeParticipant(jid);
    await message.react("✅");

    await message.reply(
      `✅ *Member Removed*\n\n@${
        jid.split("@")[0]
      } has been removed from the group`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("Kick command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to remove member_");
  }
});

Module({
  command: "promote",
  package: "group",
  description: "Promote member to admin",
  usage: ".promote <reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) {
      return message.send("❌ _Tag or reply to a user to promote_");
    }

    if (message.groupAdmins.includes(jid)) {
      return message.send("ℹ️ _User is already an admin_");
    }

    if (!message.isParticipant(jid)) {
      return message.send("❌ _User is not in the group_");
    }

    await message.react("⏳");
    await message.promoteParticipant(jid);
    await message.react("👑");

    await message.reply(
      `👑 *Promoted to Admin*\n\n@${jid.split("@")[0]} is now a group admin`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("Promote command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to promote member_");
  }
});

Module({
  command: "demote",
  package: "group",
  description: "Demote admin to member",
  usage: ".demote <reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jid = extractJid(message);
    if (!jid) {
      return message.send("❌ _Tag or reply to an admin to demote_");
    }

    if (jid === message.groupOwner) {
      return message.send("❌ _Cannot demote the group owner_");
    }

    if (!message.groupAdmins.includes(jid)) {
      return message.send("ℹ️ _User is not an admin_");
    }

    await message.react("⏳");
    await message.demoteParticipant(jid);
    await message.react("✅");

    await message.reply(
      `✅ *Demoted to Member*\n\n@${jid.split("@")[0]} is no longer an admin`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("Demote command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to demote admin_");
  }
});

// ==================== GROUP SETTINGS ====================

Module({
  command: "open",
  package: "group",
  aliases: ["unmute"],
  description: "Allow all members to send messages",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (!message.announce) {
      return message.send("ℹ️ _Group is already open_");
    }

    await message.react("⏳");
    await message.unmuteGroup();
    await message.react("🔓");

    await message.reply(
      "🔓 *Group Opened*\n\nAll members can now send messages"
    );
  } catch (error) {
    console.error("Open command error:", error);
    await message.send("❌ _Failed to open group_");
  }
});

Module({
  command: "close",
  package: "group",
  aliases: ["mute"],
  description: "Only admins can send messages",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (message.announce) {
      return message.send("ℹ️ _Group is already closed_");
    }

    await message.react("⏳");
    await message.muteGroup();
    await message.react("🔒");

    await message.reply(
      "🔒 *Group Closed*\n\nOnly admins can send messages now"
    );
  } catch (error) {
    console.error("Close command error:", error);
    await message.send("❌ _Failed to close group_");
  }
});

Module({
  command: "lock",
  package: "group",
  description: "Lock group info (only admins can edit)",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    await message.lockGroup();
    await message.react("🔒");

    await message.reply(
      "🔒 *Group Info Locked*\n\nOnly admins can edit group info now"
    );
  } catch (error) {
    console.error("Lock command error:", error);
    await message.send("❌ _Failed to lock group info_");
  }
});

Module({
  command: "unlock",
  package: "group",
  description: "Unlock group info (all members can edit)",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    await message.unlockGroup();
    await message.react("🔓");

    await message.reply(
      "🔓 *Group Info Unlocked*\n\nAll members can edit group info now"
    );
  } catch (error) {
    console.error("Unlock command error:", error);
    await message.send("❌ _Failed to unlock group info_");
  }
});

// ==================== GROUP CUSTOMIZATION ====================

Module({
  command: "setgpp",
  package: "group",
  aliases: ["seticon", "setimage"],
  description: "Set group profile picture",
  usage: ".setgpp <reply to image>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const isImage =
      message.type === "imageMessage" ||
      message.quoted?.type === "imageMessage";

    if (!isImage) {
      return message.send(
        "❌ _Reply to an image or send an image with the command_"
      );
    }

    await message.react("⏳");

    const buffer =
      message.type === "imageMessage"
        ? await message.download()
        : await message.quoted.download();

    await message.setPp(message.from, buffer);
    await message.react("✅");

    await message.reply(
      "✅ *Profile Picture Updated*\n\nGroup icon has been changed"
    );
  } catch (error) {
    console.error("SetGPP command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to update group profile picture_");
  }
});

Module({
  command: "subject",
  package: "group",
  aliases: ["setname", "groupname"],
  description: "Change group name",
  usage: ".subject <new name>",
})(async (message, match) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (!match || match.trim().length === 0) {
      return message.send(
        "❌ _Provide a new group name_\n\n*Example:* .subject New Group Name"
      );
    }

    if (match.length > 100) {
      return message.send("❌ _Group name too long (max 100 characters)_");
    }

    await message.react("⏳");
    await message.setSubject(match.trim());
    await message.react("✅");

    await message.reply(
      `✅ *Group Name Updated*\n\n*New Name:* ${match.trim()}`
    );
  } catch (error) {
    console.error("Subject command error:", error);
    await message.send("❌ _Failed to update group name_");
  }
});

Module({
  command: "desc",
  package: "group",
  aliases: ["setdesc", "description"],
  description: "Change group description",
  usage: ".desc <new description>",
})(async (message, match) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (!match || match.trim().length === 0) {
      return message.send(
        "❌ _Provide a new group description_\n\n*Example:* .desc This is our group"
      );
    }

    if (match.length > 512) {
      return message.send("❌ _Description too long (max 512 characters)_");
    }

    await message.react("⏳");
    await message.setDescription(match.trim());
    await message.react("✅");

    await message.reply(
      "✅ *Description Updated*\n\nGroup description has been changed"
    );
  } catch (error) {
    console.error("Description command error:", error);
    await message.send("❌ _Failed to update group description_");
  }
});

// ==================== GROUP INFORMATION ====================

Module({
  command: "groupinfo",
  package: "group",
  aliases: ["ginfo", "gcinfo"],
  description: "Get detailed group information",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const createdDate = new Date(message.groupMetadata.creation * 1000);
    const regularMembers =
      message.groupParticipants.length - message.groupAdmins.length;

    const info = `╭━━━「 *GROUP INFO* 」━━━╮
┃
┃ ✦ *Name:* ${message.groupMetadata.subject}
┃ ✦ *ID:* ${message.from.split("@")[0]}
┃ ✦ *Created:* ${createdDate.toLocaleDateString()}
┃ ✦ *Owner:* @${message.groupOwner.split("@")[0]}
┃
┃ ━━━━━━━━━━━━━━━━━━
┃
┃ 👥 *Members:* ${message.groupParticipants.length}
┃ 👑 *Admins:* ${message.groupAdmins.length}
┃ 👤 *Regular:* ${regularMembers}
┃
┃ ━━━━━━━━━━━━━━━━━━
┃
┃ ⚙️ *Settings:*
┃ • Messages: ${message.announce ? "🔒 Admins Only" : "🔓 All Members"}
┃ • Edit Info: ${message.restrict ? "🔒 Admins Only" : "🔓 All Members"}
┃ • Join Approval: ${message.joinApprovalMode ? "✅ Enabled" : "❌ Disabled"}
┃${
      message.groupMetadata.desc
        ? `\n┃ ━━━━━━━━━━━━━━━━━━\n┃\n┃ 📝 *Description:*\n┃ ${message.groupMetadata.desc.substring(
            0,
            200
          )}${message.groupMetadata.desc.length > 200 ? "..." : ""}\n┃`
        : ""
    }
╰━━━━━━━━━━━━━━━━━━╯`;

    await message.reply(info, { mentions: [message.groupOwner] });
  } catch (error) {
    console.error("Groupinfo command error:", error);
    await message.send("❌ _Failed to fetch group info_");
  }
});

Module({
  command: "invite",
  package: "group",
  aliases: ["link", "grouplink"],
  description: "Get group invite link",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    const code = await message.inviteCode();
    await message.react("✅");

    await message.reply(
      `╭━━━「 *GROUP INVITE* 」━━━╮\n┃\n┃ 🔗 *Link:*\n┃ https://chat.whatsapp.com/${code}\n┃\n╰━━━━━━━━━━━━━━━━━━╯`
    );
  } catch (error) {
    console.error("Invite command error:", error);
    await message.send("❌ _Failed to generate invite link_");
  }
});

Module({
  command: "revoke",
  package: "group",
  aliases: ["resetlink", "newlink"],
  description: "Revoke and generate new invite link",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    await message.revokeInvite();
    const newCode = await message.inviteCode();
    await message.react("✅");

    await message.reply(
      `✅ *Link Revoked*\n\nPrevious link is now invalid\n\n*New Link:*\nhttps://chat.whatsapp.com/${newCode}`
    );
  } catch (error) {
    console.error("Revoke command error:", error);
    await message.send("❌ _Failed to revoke invite link_");
  }
});

Module({
  command: "requests",
  package: "group",
  aliases: ["joinrequests", "pending"],
  description: "View pending join requests",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    let text = `╭━━━「 *PENDING REQUESTS* 」━━━╮\n┃\n`;

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      text += `┃ ${i + 1}. @${req.jid.split("@")[0]}\n`;
    }

    text += `┃\n╰━━━━━━━━━━━━━━━━━━╯\n\n*Total:* ${requests.length} request(s)\n\n*Commands:*\n• .approve - Approve all\n• .reject - Reject all`;

    const mentions = requests.map((r) => r.jid);
    await message.reply(text, { mentions });
  } catch (error) {
    console.error("Requests command error:", error);
    await message.send("❌ _Failed to fetch join requests_");
  }
});

Module({
  command: "approve",
  package: "group",
  aliases: ["acceptall"],
  description: "Approve all pending join requests",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    await message.react("⏳");
    const jids = requests.map((r) => r.jid);
    await message.approveJoinRequest(jids);
    await message.react("✅");

    await message.reply(
      `✅ *Approved ${requests.length} request(s)*\n\nNew members have been added`
    );
  } catch (error) {
    console.error("Approve command error:", error);
    await message.send("❌ _Failed to approve requests_");
  }
});

Module({
  command: "reject",
  package: "group",
  aliases: ["rejectall"],
  description: "Reject all pending join requests",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    await message.react("⏳");
    const jids = requests.map((r) => r.jid);
    await message.rejectJoinRequest(jids);
    await message.react("✅");

    await message.reply(`✅ *Rejected ${requests.length} request(s)*`);
  } catch (error) {
    console.error("Reject command error:", error);
    await message.send("❌ _Failed to reject requests_");
  }
});

// ==================== BOT ACTIONS ====================

Module({
  command: "leave",
  package: "group",
  aliases: ["exit"],
  description: "Bot leaves the group",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isFromMe) {
      return message.send("❌ _Only bot owner can use this_");
    }

    await message.reply("👋 *Goodbye!*\n\nLeaving the group in 3 seconds...");

    setTimeout(async () => {
      try {
        await message.leaveGroup();
      } catch (err) {
        console.error("Error leaving group:", err);
      }
    }, 3000);
  } catch (error) {
    console.error("Leave command error:", error);
    await message.send("❌ _Failed to leave group_");
  }
});

Module({
  command: "exit",
  package: "group",
  aliases: ["exit"],
  description: "Bot leaves the group",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isFromMe) {
      return message.send("❌ _Only bot owner can use this_");
    }

    await message.reply("👋 *Goodbye!*\n\nLeaving the group in 3 seconds...");

    setTimeout(async () => {
      try {
        await message.leaveGroup();
      } catch (err) {
        console.error("Error leaving group:", err);
      }
    }, 3000);
  } catch (error) {
    console.error("Leave command error:", error);
    await message.send("❌ _Failed to leave group_");
  }
});

Module({
  command: "left",
  package: "group",
  aliases: ["exit"],
  description: "Bot leaves the group",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isFromMe) {
      return message.send("❌ _Only bot owner can use this_");
    }

    await message.reply("👋 *Goodbye!*\n\nLeaving the group in 3 seconds...");

    setTimeout(async () => {
      try {
        await message.leaveGroup();
      } catch (err) {
        console.error("Error leaving group:", err);
      }
    }, 3000);
  } catch (error) {
    console.error("Leave command error:", error);
    await message.send("❌ _Failed to leave group_");
  }
});
// ==================== NEW FEATURES ====================

Module({
  command: "poll",
  package: "group",
  description: "Create a poll in group",
  usage: ".poll Question | Option1 | Option2 | Option3",
})(async (message, match) => {
  try {
    if (!message.isGroup) return message.send(theme.isGroup);

    if (!match) {
      return message.send(
        "❌ _Invalid format_\n\n*Usage:*\n.poll Question | Option1 | Option2 | Option3\n\n*Example:*\n.poll Best color? | Red | Blue | Green"
      );
    }

    const parts = match.split("|").map((p) => p.trim());

    if (parts.length < 3) {
      return message.send("❌ _Provide at least a question and 2 options_");
    }

    const question = parts[0];
    const options = parts.slice(1);

    if (options.length > 12) {
      return message.send("❌ _Maximum 12 options allowed_");
    }

    await message.send({
      poll: {
        name: question,
        values: options,
        selectableCount: 1,
      },
    });
  } catch (error) {
    console.error("Poll command error:", error);
    await message.send("❌ _Failed to create poll_");
  }
});

Module({
  command: "disappear",
  package: "group",
  aliases: ["ephemeral"],
  description: "Set disappearing messages",
  usage: ".disappear <0|24h|7d|90d>",
})(async (message, match) => {
  try {
    if (!(await checkPermissions(message))) return;

    const duration = match?.toLowerCase();
    let seconds;

    switch (duration) {
      case "0":
      case "off":
        seconds = 0;
        break;
      case "24h":
      case "1d":
        seconds = 86400;
        break;
      case "7d":
        seconds = 604800;
        break;
      case "90d":
        seconds = 7776000;
        break;
      default:
        return message.send(
          "❌ _Invalid duration_\n\n*Options:*\n• 0 or off - Disable\n• 24h - 24 hours\n• 7d - 7 days\n• 90d - 90 days"
        );
    }

    await message.conn.sendMessage(message.from, {
      disappearingMessagesInChat: seconds,
    });

    const status = seconds === 0 ? "disabled" : `enabled (${duration})`;
    await message.reply(`✅ Disappearing messages ${status}`);
  } catch (error) {
    console.error("Disappear command error:", error);
    await message.send("❌ _Failed to set disappearing messages_");
  }
});

Module({
  command: "announce",
  package: "group",
  description: "Send announcement to all members (DM)",
  usage: ".announce <message>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe)
      return message.send(theme.isAdmin);

    if (!match) {
      return message.send(
        "❌ _Provide announcement message_\n\n*Example:* .announce Important meeting tomorrow"
      );
    }

    await message.react("⏳");

    const participants = message.groupParticipants.map((p) => p.id);
    const groupName = message.groupMetadata.subject;

    let success = 0;
    let failed = 0;

    for (const jid of participants) {
      try {
        await message.conn.sendMessage(jid, {
          text: `📢 *GROUP ANNOUNCEMENT*\n\n*From:* ${groupName}\n*Message:*\n${match}`,
        });
        success++;
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay to avoid spam
      } catch (err) {
        failed++;
      }
    }

    await message.react("✅");
    await message.reply(
      `✅ *Announcement Sent*\n\n• Success: ${success}\n• Failed: ${failed}`
    );
  } catch (error) {
    console.error("Announce command error:", error);
    await message.send("❌ _Failed to send announcement_");
  }
});

Module({
  command: "invite",
  package: "group",
  aliases: ["inv"],
  description: "Invite user via private message",
  usage: ".invite <number>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe)
      return message.send(theme.isAdmin);
    if (!message.isBotAdmin) return message.send(theme.isBotAdmin);

    const jid = extractJid(message);
    if (!jid) {
      return message.send(
        "❌ _Provide a number_\n\n*Example:* .invite 1234567890"
      );
    }

    if (message.isParticipant(jid)) {
      return message.send("ℹ️ _User is already in the group_");
    }

    const code = await message.inviteCode();
    const groupName = message.groupMetadata.subject;

    await message.conn.sendMessage(jid, {
      text: `📩 *GROUP INVITATION*\n\n*Group:* ${groupName}\n*Invited by:* @${
        message.sender.split("@")[0]
      }\n\n*Join Link:*\nhttps://chat.whatsapp.com/${code}`,
      mentions: [message.sender],
    });

    await message.reply(
      `✅ *Invitation Sent*\n\nInvite link sent to @${jid.split("@")[0]}`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("Invite command error:", error);
    await message.send("❌ _Failed to send invitation_");
  }
});

Module({
  command: "everyone",
  package: "group",
  aliases: ["all", "tagall"],
  description: "Tag all group members",
  usage: ".everyone <message>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe)
      return message.send(theme.isAdmin);

    const text = match || "📢 *ATTENTION EVERYONE*";
    const participants = message.groupParticipants;

    let tagText = `${text}\n\n╭─「 *MEMBERS* 」\n`;

    for (let i = 0; i < participants.length; i++) {
      tagText += `│ ${i + 1}. @${participants[i].id.split("@")[0]}\n`;
    }

    tagText += `╰────────────\n\n*Total:* ${participants.length} members`;

    const mentions = participants.map((p) => p.id);
    await message.send(tagText, { mentions });
  } catch (error) {
    console.error("Everyone command error:", error);
    await message.send("❌ _Failed to tag everyone_");
  }
});

Module({
  command: "totag",
  package: "group",
  description: "Tag users by replying to their message",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe)
      return message.send(theme.isAdmin);

    if (!message.quoted) {
      return message.send("❌ _Reply to a message to use this command_");
    }

    const mentions = message.groupParticipants.map((p) => p.id);

    // Forward the quoted message with all tags
    await message.conn.sendMessage(message.from, {
      forward: message.quoted.raw,
      mentions: mentions,
    });
  } catch (error) {
    console.error("ToTag command error:", error);
    await message.send("❌ _Failed to tag with message_");
  }
});

Module({
  command: "groupdp",
  package: "group",
  aliases: ["gdp", "groupicon"],
  description: "Get group display picture",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const ppUrl = await message.profilePictureUrl(message.from, "image");

    if (!ppUrl) {
      return message.send("❌ _This group has no display picture_");
    }

    await message.send({
      image: { url: ppUrl },
      caption: `*${message.groupMetadata.subject}*\n\n_Group Display Picture_`,
    });
  } catch (error) {
    console.error("GroupDP command error:", error);
    await message.send("❌ _Failed to fetch group display picture_");
  }
});

Module({
  command: "inactive",
  package: "group",
  description: "List potentially inactive members (no recent messages)",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isFromMe)
      return message.send(theme.isAdmin);

    // This is a placeholder - actual implementation would require tracking message history
    await message.send(
      "ℹ️ *Inactive Member Detection*\n\nThis feature requires message history tracking to be implemented.\n\n_Coming soon!_"
    );
  } catch (error) {
    console.error("Inactive command error:", error);
    await message.send("❌ _Failed to check inactive members_");
  }
});

Module({
  command: "grouphelp",
  package: "group",
  aliases: ["ghelp", "groupcmd"],
  description: "Show all group management commands",
})(async (message) => {
  try {
    const help = `╭━━━「 *GROUP COMMANDS* 」━━━╮
┃
┃ *👥 MEMBER MANAGEMENT*
┃ • .add - Add member
┃ • .kick - Remove member
┃ • .promote - Make admin
┃ • .demote - Remove admin
┃ • .admins - List admins
┃
┃ *⚙️ GROUP SETTINGS*
┃ • .open - Allow all to message
┃ • .close - Admin only messages
┃ • .lock - Lock group info
┃ • .unlock - Unlock group info
┃ • .disappear - Disappearing msgs
┃
┃ *✏️ CUSTOMIZATION*
┃ • .subject - Change name
┃ • .desc - Change description
┃ • .setgpp - Set group icon
┃ • .groupdp - Get group icon
┃
┃ *📊 INFORMATION*
┃ • .groupinfo - Group details
┃ • .groupstats - Statistics
┃ • .warnings - Check warnings
┃ • .groupwarnings - All warnings
┃
┃ *🔗 INVITE & LINKS*
┃ • .invite - Get invite link
┃ • .revoke - Reset link
┃ • .requests - View join requests
┃ • .approve - Approve requests
┃ • .reject - Reject requests
┃
┃ *📢 MESSAGING*
┃ • .everyone - Tag all members
┃ • .hidetag - Hidden tag
┃ • .tagadmins - Tag admins only
┃ • .announce - DM announcement
┃ • .mention - Mention users
┃ • .poll - Create poll
┃
┃ *🛡️ MODERATION*
┃ • .warn - Warn user
┃ • .resetwarn - Clear warnings
┃ • .antilink - Toggle antilink
┃ • .welcome - Toggle welcome
┃ • .goodbye - Toggle goodbye
┃
┃ *🤖 BOT*
┃ • .leave - Bot leaves group
┃
╰━━━━━━━━━━━━━━━━━━╯

_Use .command to see usage details_`;

    await message.reply(help);
  } catch (error) {
    console.error("GroupHelp command error:", error);
    await message.send("❌ _Failed to show help_");
  }
});
