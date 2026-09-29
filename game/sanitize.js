// Player content is data. Cap its length and strip control / invisible characters.

export const LIMITS = {
  chat: 500,
  emailSubject: 80,
  emailBody: 600,
  pluginName: 40,
  pluginDescription: 400,
  payee: 40,
  memo: 100,
};

// Control chars (keeping \n and \t), bidi overrides, zero-width chars, BOM.
const STRIP = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;

export function clean(input, max) {
  if (typeof input !== "string") return "";
  return input.replace(STRIP, "").trim().slice(0, max);
}

// Tool-name-safe identifier: letters, digits, underscore.
export function toIdentifier(input, max) {
  return clean(input, max).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
