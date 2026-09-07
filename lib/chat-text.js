// Preserve decimal numbers and URLs while removing sentence full stops.
export function chatText(text) {
  return text.split(/(https?:\/\/\S+)/g).map(part => /^https?:\/\//.test(part)
    ? part
    : part.replace(/\.{2,}/g, '…').replace(/(?<!\d)\.|\.(?!\d)|。/g, ' ').replace(/ {2,}/g, ' ')).join('').trim();
}
