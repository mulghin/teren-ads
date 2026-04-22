export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['"IBM Plex Serif"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        bg: {
          DEFAULT: '#0e1015',
          panel: '#14171e',
          card: '#1a1d23',
          input: '#12151b',
          hover: '#1f232c',
          elevated: '#20242e',
        },
        text: {
          DEFAULT: '#e6e8ec',
          secondary: '#9aa0a9',
          muted: '#5a5f69',
          faint: '#3d424b',
        },
        accent: {
          DEFAULT: '#ff6a1a',
          hover: '#ff7f3a',
        },
      },
    },
  },
  plugins: [],
};
