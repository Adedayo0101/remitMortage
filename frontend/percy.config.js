module.exports = {
  version: 2,
  snapshot: {
    widths: [375, 1280],
    minHeight: 1024,
    percyCSS: `
      /* Ensure animations are disabled and dynamic elements are hidden for consistent snapshots */
      * {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      .dynamic-date, [data-testid="date-display"], .chart-animation-wrapper {
        visibility: hidden !important;
      }
    `
  },
  discovery: {
    allowedHostnames: [],
    networkIdleTimeout: 150
  }
};
