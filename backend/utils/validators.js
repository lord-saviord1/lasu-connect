// Shared input validators.
//
// Avatars and group icons are rendered into the page as a single emoji.
// They must never carry markup, so reject anything with HTML-significant
// characters, control characters, or an unreasonable length. (Emoji with
// skin tones / ZWJ sequences stay well under 24 UTF-16 units.)
function isSafeAvatar(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0 || v.length > 24) return false;
  return !/[<>&"'`\\\u0000-\u001f\u007f]/.test(v);
}

module.exports = { isSafeAvatar };
