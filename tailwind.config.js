/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // metis design system
        page:             'rgb(var(--color-page-rgb) / <alpha-value>)',
        surface:          'rgb(var(--color-surface-rgb) / <alpha-value>)',
        elevated:         'rgb(var(--color-elevated-rgb) / <alpha-value>)',
        border:           'rgb(var(--color-border-rgb) / <alpha-value>)',
        'menu-bg':        'rgb(var(--color-menu-bg-rgb) / <alpha-value>)',
        'text-primary':   'rgb(var(--color-text-primary-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--color-text-secondary-rgb) / <alpha-value>)',
        'text-muted':     'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        primary:          'rgb(var(--color-accent-rgb) / <alpha-value>)',
        secondary:        'var(--color-success)',  // metis Moss
        danger:           'var(--color-danger)',  // Signal Clay — destructive / warning
        coral:            'var(--color-danger)',
        amber:            'var(--color-warning)',
        purple:           'var(--color-data-purple)',
        cyan:             'var(--color-data-blue)',  // Workspace swatch blue
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
