/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  // Next.js internals are not needed for pure-library tests
  transformIgnorePatterns: ["/node_modules/(?!.*\\.mjs$)"],
};
