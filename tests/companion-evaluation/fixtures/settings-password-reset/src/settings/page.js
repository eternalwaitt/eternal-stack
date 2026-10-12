import { displayLabel } from './display-name.js';

export function renderSettings(user) {
  return `<h1>Settings</h1><span>${displayLabel(user.displayName)}</span>`;
}
