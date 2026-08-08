// Both sides need this: the service enforces it, the form greys out the input at the cap. Lives in
// the feature (not the service) because the browser has to be able to import it without dragging
// better-sqlite3 along.
export const MAX_LINKS = 10
