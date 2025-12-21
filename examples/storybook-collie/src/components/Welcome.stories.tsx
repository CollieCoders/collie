import type { Meta, StoryObj } from "@storybook/react";
import Welcome from "./Welcome.collie";

const meta = {
  title: "Collie/Welcome",
  component: Welcome,
  args: {
    name: "Storybook"
  }
} satisfies Meta<typeof Welcome>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
