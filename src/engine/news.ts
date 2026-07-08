import type { GameState, NewsItem, NewsType } from './types'

export const NEWS_CAP = 60

// The one way news enters the world. Structured only — the UI translates at render time.
export function pushNews(
  state: GameState,
  type: NewsType,
  params: NewsItem['params'],
  week?: number,
): GameState {
  const item: NewsItem = { season: state.season, week: week ?? state.round, type, params }
  return { ...state, news: [...state.news, item].slice(-NEWS_CAP) }
}
