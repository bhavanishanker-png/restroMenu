/**
 * Anchor ids shared by the Settings page (a Server Component) and its client
 * sections. Kept out of the "use client" files: a constant imported from one
 * of those into a Server Component arrives as a client reference, not a string.
 */
export const AI_ACCESS_SECTION_ID = "settings-ai-access";
