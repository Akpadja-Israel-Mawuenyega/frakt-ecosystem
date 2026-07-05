/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  transform: {
    // Config lives in babel.jest.config.js (not babel.config.js) so Next.js
    // doesn't detect a Babel setup and disable its SWC compiler.
    "^.+\\.js$": ["babel-jest", { configFile: "./babel.jest.config.js" }],
  },
  // Next.js internals are not needed for pure-library tests
  transformIgnorePatterns: ["/node_modules/(?!.*\\.mjs$)"],
};
