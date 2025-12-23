// Utility for common theme-aware class combinations
export const themeClasses = {
  // Backgrounds
  bgCard: "bg-[rgb(var(--bg-card))]",
  bgSecondary: "bg-[rgb(var(--bg-secondary))]",
  bgTertiary: "bg-[rgb(var(--bg-tertiary))]",
  bgHover: "hover:bg-[rgb(var(--bg-hover))]",
  
  // Borders
  border: "border-[rgb(var(--border-primary))]",
  borderSecondary: "border-[rgb(var(--border-secondary))]",
  
  // Text
  textPrimary: "text-[rgb(var(--text-primary))]",
  textSecondary: "text-[rgb(var(--text-secondary))]",
  textTertiary: "text-[rgb(var(--text-tertiary))]",
  
  // Combined patterns
  card: "bg-[rgb(var(--bg-card))] border border-[rgb(var(--border-primary))]",
  input: "bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-secondary))] text-[rgb(var(--text-primary))]",
  modal: "bg-[rgb(var(--bg-secondary))] border border-[rgb(var(--border-primary))]",
  select: "bg-[rgb(var(--bg-tertiary))] border border-[rgb(var(--border-secondary))]",
};