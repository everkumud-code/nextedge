/** Palette comes from CSS variables (see src/index.css), so one switch (data-theme on <html>) re-colours the whole panel. Classic = the original marigold-on-teal look. */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'), ink: v('ink'),
        teal: { 100: v('teal-100'), 200: v('teal-200'), 700: v('teal-700'), 800: v('teal-800'), 900: v('teal-900') },
        marigold: { 100: v('marigold-100'), 500: v('marigold-500'), 600: v('marigold-600') },
        edge: { 50: v('edge-50'), 100: v('edge-100'), 500: v('edge-500'), 600: v('edge-600'), 700: v('edge-700') },
        moss: v('moss'), brick: v('brick'),
      },
      fontFamily: { sans: ['var(--font-body)', '"Hanken Grotesk"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
