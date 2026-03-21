// @ts-check
import tsEslintParser from "@typescript-eslint/parser";
import perfectionist from "eslint-plugin-perfectionist";

/** @type {import('eslint').Linter.Config[]} */
export default [
	{
		files: ["**/*.{js,ts}", "data/**/*.json"],
	},
	{
		ignores: ["node_modules/**", "dist/**"],
		languageOptions: {
			parser: tsEslintParser,
			parserOptions: {
				project: "./tsconfig.eslint.json",
			},
		},
		plugins: { perfectionist },
		rules: {
			"perfectionist/sort-array-includes": "error",
			"perfectionist/sort-classes": "error",
			"perfectionist/sort-enums": "error",
			"perfectionist/sort-interfaces": "error",
			"perfectionist/sort-jsx-props": "error",
			"perfectionist/sort-modules": "error",
			"perfectionist/sort-object-types": "error",
			"perfectionist/sort-objects": "error",
			"perfectionist/sort-switch-case": "error",
			"perfectionist/sort-union-types": "error",
		},
	},
];
