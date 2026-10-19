/** Palette: marigold accent on deep teal — chosen for coaching centres, not a generic SaaS kit. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F3F5F8', ink: '#1A1F26', teal: { 900: '#11343C', 800: '#174651', 100: '#DCEBEE' },
        marigold: { 500: '#F2A93B', 600: '#D98F1F', 100: '#FDF1DC' }, moss: '#2F8F5B', brick: '#C4412B',
      },
      fontFamily: { sans: ['"Hanken Grotesk"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
