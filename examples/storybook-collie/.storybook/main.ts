import type { StorybookConfig } from "@storybook/react-vite";
import { withCollieStorybook } from "@collie-lang/storybook";

const config: StorybookConfig = withCollieStorybook({
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  }
});

export default config;
