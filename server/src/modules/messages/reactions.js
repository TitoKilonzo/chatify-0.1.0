/*
 * Reactions are chosen from a fixed set of icons, not free text. The key is what is stored and
 * sent; the client maps each key to an icon and a spoken label.
 */
export const REACTION_KEYS = ['like', 'love', 'laugh', 'sad', 'star', 'done'];

export const isReactionKey = (value) => REACTION_KEYS.includes(value);
