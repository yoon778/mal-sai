import { User, SafeArea, Screen, Storage, graniteEvent } from '@apps-in-toss/web-framework';

let cleanups = [];
export async function initialize(onBack) {
  const identity = await User.getAnonymousKey();
  if (identity?.type !== 'HASH' || !identity.hash) throw new Error('토스에서 말사이를 다시 열어 주세요');
  cleanups.forEach(remove => remove());
  const insets = value => {
    for (const side of ['top', 'bottom', 'left', 'right']) document.documentElement.style.setProperty(`--safe-${side}`, `${Math.max(0, value[side])}px`);
  };
  insets(SafeArea.get());
  cleanups = [SafeArea.subscribe({ onEvent: insets }), ...['backEvent', 'homeEvent'].map(event => graniteEvent.addEventListener(event, { onEvent: onBack, onError: () => onBack() }))];
  document.documentElement.dataset.platform = 'toss';
  return identity.hash;
}
export const getItem = key => Storage.getItem(key);
export const setItem = (key, value) => Storage.setItem(key, value);
export const removeItem = key => Storage.removeItem(key);
export const close = () => Screen.close();
