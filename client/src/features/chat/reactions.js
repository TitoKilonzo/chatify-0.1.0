import { CircleCheck, Frown, Heart, Laugh, Star, ThumbsUp } from 'lucide-react';

/** Reaction keys the server accepts, with the icon and the accessible name for each. */
export const REACTIONS = [
  { key: 'like', icon: ThumbsUp, label: 'Like' },
  { key: 'love', icon: Heart, label: 'Love' },
  { key: 'laugh', icon: Laugh, label: 'Funny' },
  { key: 'sad', icon: Frown, label: 'Sad' },
  { key: 'star', icon: Star, label: 'Star' },
  { key: 'done', icon: CircleCheck, label: 'Done' },
];

export const REACTION_BY_KEY = Object.fromEntries(REACTIONS.map((r) => [r.key, r]));
