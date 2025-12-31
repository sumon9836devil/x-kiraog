// lib/warn.js
const settings = require("../../lib/database/settingdb");

async function getGroupWarnData(groupJid) {
  let data = await settings.getGroup(groupJid, "warn");
  if (!data) {
    data = { limit: 3, users: {} };
    await settings.setGroupPlugin(groupJid, "warn", data);
  }
  return data;
}

async function setWarnLimit(groupJid, limit) {
  const data = await getGroupWarnData(groupJid);
  data.limit = limit;
  await settings.setGroupPlugin(groupJid, "warn", data);
  return limit;
}

async function addWarn(groupJid, userJid, info = {}) {
  const data = await getGroupWarnData(groupJid);
  const limit = data.limit;

  if (!data.users[userJid]) {
    data.users[userJid] = { count: 0, reasons: [] };
  }

  data.users[userJid].count += 1;
  data.users[userJid].reasons.push({
    reason: info.reason || "unknown",
    by: info.by || "system",
    time: Date.now(),
  });

  await settings.setGroupPlugin(groupJid, "warn", data);

  const count = data.users[userJid].count;
  const reached = count >= limit;
  return { count, limit, reached };
}

async function removeWarn(groupJid, userJid) {
  const data = await getGroupWarnData(groupJid);
  if (!data.users[userJid]) return 0;

  data.users[userJid].count -= 1;
  if (data.users[userJid].count <= 0) {
    delete data.users[userJid];
  }

  await settings.setGroupPlugin(groupJid, "warn", data);
  return data.users[userJid]?.count || 0;
}

async function listWarns(groupJid) {
  const data = await getGroupWarnData(groupJid);
  return { limit: data.limit, users: data.users };
}

async function getWarnCount(groupJid, userJid) {
  const data = await getGroupWarnData(groupJid);
  return data.users[userJid]?.count || 0;
}

module.exports = {
  addWarn,
  removeWarn,
  setWarnLimit,
  listWarns,
  getWarnCount,
};
