const capabilities = [
  'I set up group chats. Mention me with the people you want in, and I\'ll make it happen.',
  'Need a group chat? Tag the people you want and I\'ll handle the rest.',
  'I create group chats. Just mention me along with whoever you want to loop in.',
];

const followUp = [
  'Not quite sure what you\'re after. Try: @ConvosConnect put @alice and @bob in a chat about design',
  'Didn\'t catch that. Try something like: @ConvosConnect add @alice @bob to a chat about the project',
  'I need a bit more to work with. Try: @ConvosConnect start a chat with @alice and @bob about launch plans',
];

const success = [
  ({ title, inviteUrl }) => `Done. "${title}" is ready for you: ${inviteUrl}`,
  ({ title, inviteUrl }) => `All set. "${title}" — jump in here: ${inviteUrl}`,
  ({ title, inviteUrl }) => `"${title}" is good to go: ${inviteUrl}`,
];

const error = [
  'Something went sideways on my end. Give it another shot in a minute.',
  'Hit a snag. Try again in a bit.',
  'Ran into an issue. Try again shortly.',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function capabilitiesResponse() {
  return pick(capabilities);
}

export function followUpResponse() {
  return pick(followUp);
}

export function successResponse({ title, inviteUrl }) {
  return pick(success)({ title, inviteUrl });
}

export function errorResponse() {
  return pick(error);
}
