import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/bounded-contexts/*/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "@/app/**",
            "@/composition/**",
            "@/shared/**",
            "@/bounded-contexts/*/application/**",
            "@/bounded-contexts/*/infrastructure/**",
            "@/bounded-contexts/*/presentation/**"
          ],
          message: "Domain code may only depend on domain contracts."
        }]
      }]
    }
  },
  {
    files: ["src/bounded-contexts/*/application/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "@/app/**",
            "@/composition/**",
            "@/shared/**",
            "@/bounded-contexts/*/infrastructure/**",
            "@/bounded-contexts/*/presentation/**"
          ],
          message: "Application code cannot depend on delivery or infrastructure adapters."
        }]
      }]
    }
  },
  {
    files: ["src/bounded-contexts/*/infrastructure/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/app/**", "@/composition/**", "@/bounded-contexts/*/presentation/**"],
          message: "Infrastructure adapters cannot depend on delivery or presentation code."
        }]
      }]
    }
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
