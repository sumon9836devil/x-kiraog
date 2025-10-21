Basic Usage Example
// In your command/plugin file
module.exports = {
name: "example",
description: "Example command",
category: "general",
async execute(message, args) {
// Your code here
}
};

1. Basic Message Properties
   // Access message information
   console.log(message.body); // Message text
   console.log(message.from); // Chat ID
   console.log(message.sender); // Sender ID
   console.log(message.pushName); // Sender name
   console.log(message.isGroup); // true/false
   console.log(message.isFromMe); // true/false (if bot sent it)
   console.log(message.id); // Message ID
   console.log(message.type); // Message type
2. Send Messages
   // Send simple text
   await message.send("Hello World!");

// Send with formatting
await message.send("_Bold_ _italic_ ~strikethrough~");

// Send image
await message.send({
image: buffer, // or { url: "image_url" }
caption: "Check this out!"
});

// Send video
await message.send({
video: buffer,
caption: "Amazing video!",
mimetype: "video/mp4"
});

// Send audio
await message.send({
audio: buffer,
mimetype: "audio/mp4",
ptt: true // true for voice note, false for audio file
});

// Send document
await message.send({
document: buffer,
fileName: "document.pdf",
mimetype: "application/pdf"
});

// Send sticker
await message.send({
sticker: buffer
});

// Send location
await message.send({
location: {
degreesLatitude: 37.7749,
degreesLongitude: -122.4194
}
});

// Send contact
await message.send({
contacts: {
displayName: "John Doe",
contacts: [{ vcard: "..." }]
}
}); 3. Reply to Messages
// Reply to current message
await message.reply("This is a reply!");

// Reply with media
await message.reply({
image: buffer,
caption: "Replying with image"
});

// Alternative method (same as reply)
await message.sendReply("Reply text"); 4. React to Messages
// React with emoji
await message.react("❤️");
await message.react("👍");
await message.react("😂");
await message.react("🔥");

// Remove reaction (empty string)
await message.react(""); 5. Delete & Edit Messages
// Delete the current message
await message.delete();

// Delete another message
await message.send({ delete: someMessageKey });

// Edit your own message (only bot's messages)
if (message.isFromMe) {
await message.edit("Updated text");
} 6. Download Media
// Download media from current message
if (message.type === "imageMessage" ||
message.type === "videoMessage" ||
message.type === "audioMessage") {

const buffer = await message.download();
// Use the buffer
await message.send({ image: buffer, caption: "Here's your image!" });
}

// Download from quoted message
if (message.quoted) {
const quotedBuffer = await message.quoted.download();
} 7. Send from URL
// Send image from URL
await message.sendFromUrl("https://example.com/image.jpg");

// Send as sticker
await message.sendFromUrl("https://example.com/image.jpg", {
asSticker: true
});

// Send as document
await message.sendFromUrl("https://example.com/file.pdf", {
asDocument: true,
fileName: "document.pdf",
mimetype: "application/pdf"
});

// Send video from URL
await message.sendFromUrl("https://example.com/video.mp4", {
asVideo: true,
caption: "Video from URL"
});

// Send audio from URL
await message.sendFromUrl("https://example.com/audio.mp3", {
asAudio: true,
ptt: true // voice note
}); 8. Group Operations
// First, load group info
await message.loadGroupInfo();

// Check if user is admin
if (message.isAdmin) {
console.log("User is admin!");
}

// Check if bot is admin
if (message.isBotAdmin) {
console.log("Bot is admin!");
}

// Get group info
console.log(message.groupMetadata);
console.log(message.groupParticipants);
console.log(message.groupAdmins);
console.log(message.groupOwner);

// Mute/Unmute group
await message.muteGroup(); // Only admins can send
await message.unmuteGroup(); // Everyone can send

// Lock/Unlock group
await message.lockGroup(); // Only admins can edit group info
await message.unlockGroup(); // Everyone can edit group info

// Change group subject
await message.setSubject("New Group Name");

// Change group description
await message.setDescription("New group description");

// Add participants
await message.addParticipant("1234567890@s.whatsapp.net");
await message.addParticipant(["user1@s.whatsapp.net", "user2@s.whatsapp.net"]);

// Remove participants
await message.removeParticipant("1234567890@s.whatsapp.net");
await message.kickParticipant("1234567890@s.whatsapp.net"); // same as remove

// Promote to admin
await message.promoteParticipant("1234567890@s.whatsapp.net");

// Demote from admin
await message.demoteParticipant("1234567890@s.whatsapp.net");

// Get invite code
const code = await message.inviteCode();
console.log(`Group invite: https://chat.whatsapp.com/${code}`);

// Revoke invite link
await message.revokeInvite();

// Leave group
await message.leaveGroup();

// Get join requests
const requests = await message.getJoinRequests();

// Approve join request
await message.approveJoinRequest("1234567890@s.whatsapp.net");

// Reject join request
await message.rejectJoinRequest("1234567890@s.whatsapp.net");

// Get participants list
const participants = message.getParticipants();

// Get admins list
const admins = message.getAdmins();

// Check if user is participant
if (message.isParticipant("1234567890@s.whatsapp.net")) {
console.log("User is in group");
} 9. Quoted Messages
// Check if message has quoted message
if (message.quoted) {
console.log(message.quoted.body); // Quoted text
console.log(message.quoted.sender); // Who sent quoted message
console.log(message.quoted.type); // Quoted message type
console.log(message.quoted.fromMe); // If bot sent quoted message

// Download quoted media
if (message.quoted.type === "imageMessage") {
const buffer = await message.quoted.download();
await message.send({ image: buffer, caption: "Your quoted image" });
}
} 10. Mentions
// Get mentioned users
console.log(message.mentions); // Array of JIDs

// Send message with mentions
await message.send({
text: "Hello @1234567890 and @0987654321!",
mentions: ["1234567890@s.whatsapp.net", "0987654321@s.whatsapp.net"]
}); 11. Typing & Recording Indicators
// Show typing indicator
await message.startTyping();
// ... do something
await message.stopTyping();

// Show recording indicator
await message.startRecording();
// ... do something
await message.stopRecording();

// Example with delay
await message.startTyping();
await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 seconds
await message.send("Here's your response!"); 12. Read Status
// Mark message as read
await message.markAsRead(); 13. User Profile Operations
// Get user's status
const status = await message.fetchStatus(message.sender);
console.log(status);

// Get profile picture URL
const ppUrl = await message.profilePictureUrl(message.sender);
if (ppUrl) {
await message.send({ image: { url: ppUrl } });
}

// Set profile picture (for bot)
const imageBuffer = await message.download();
await message.setPp(null, imageBuffer); // null = bot's own profile

// Remove profile picture
await message.removePp();

// Block user
await message.blockUser("1234567890@s.whatsapp.net");

// Unblock user
await message.unblockUser("1234567890@s.whatsapp.net"); 14. Forward Messages
// Forward message to another chat
await message.forward("1234567890@s.whatsapp.net");

// Forward to multiple chats
await message.forward("group1@g.us");
await message.forward("group2@g.us");

// Copy and send (without forward label)
await message.copyNSend("1234567890@s.whatsapp.net"); 15. Connection Object
// Access baileys connection directly
const conn = message.conn; // or message.client

// Use baileys methods
await conn.sendMessage(message.from, { text: "Direct send" });
await conn.updateProfileStatus("New status");
Complete Example Plugin
module.exports = {
name: "demo",
aliases: ["test"],
description: "Demo all features",
category: "utility",
async execute(message, args) {

    // Load group info if in group
    if (message.isGroup) {
      await message.loadGroupInfo();

      // Only allow admins
      if (!message.isAdmin) {
        return await message.reply("Only admins can use this!");
      }
    }

    // Show typing
    await message.startTyping();

    // React to message
    await message.react("✅");

    // Send response
    await message.send(`

_Demo Command_

👤 User: ${message.pushName}
📱 Sender: ${message.sender}
💬 Message: ${message.body}
🏷️ Type: ${message.type}
👥 Group: ${message.isGroup ? "Yes" : "No"}
🤖 From Me: ${message.isFromMe ? "Yes" : "No"}
`.trim());

    // If has quoted message
    if (message.quoted) {
      await message.reply(`You quoted: ${message.quoted.body}`);
    }

    // If has media
    if (message.type === "imageMessage") {
      const buffer = await message.download();
      await message.send({
        image: buffer,
        caption: "Got your image!"
      });
    }

    // Stop typing
    await message.stopTyping();

}
};
Admin-Only Command Example
module.exports = {
name: "kick",
description: "Kick user from group",
category: "admin",
async execute(message, args) {

    // Check if group
    if (!message.isGroup) {
      return await message.reply("This command only works in groups!");
    }

    // Load group info
    await message.loadGroupInfo();

    // Check if bot is admin
    if (!message.isBotAdmin) {
      return await message.reply("I need admin privileges!");
    }

    // Check if user is admin
    if (!message.isAdmin) {
      return await message.reply("Only admins can kick members!");
    }

    // Get mentioned user or quoted user
    let target = message.mentions[0] || message.quoted?.sender;

    if (!target) {
      return await message.reply("Mention or reply to a user to kick!");
    }

    // Don't kick admins
    if (message.groupAdmins.includes(target)) {
      return await message.reply("Cannot kick admins!");
    }

    // Kick user
    await message.removeParticipant(target);
    await message.send(`✅ User kicked successfully!`);

}
};
This covers all the major functions! Let me know if you need more specific examples.
