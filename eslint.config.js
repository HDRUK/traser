import tsPlugin from "@typescript-eslint/eslint-plugin";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "node_modules/",
      "build/",
      ".react-router/",
      "data/",
      "coverage/",
      "*.config.js",
      "updateVersions.js",
    ],
  },
  ...tsPlugin.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx}"],
    ...react.configs.flat.recommended,
    settings: { react: { version: "detect" } },
  },
  {
    files: ["**/*.{ts,tsx}"],
    ...react.configs.flat["jsx-runtime"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
