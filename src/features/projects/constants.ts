// The cap on one "Refresh selected": the sidebar stops ticking boxes at it, the controller's
// validator rejects past it. Lives in the feature so the browser can import it without dragging
// better-sqlite3 along — same reason as links' MAX_LINKS.
export const MAX_SELECTED_PROJECTS = 8
