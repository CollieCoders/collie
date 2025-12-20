"use client";

import { useState } from "react";
import Welcome from "@/components/Welcome.collie";
import Card from "@/components/Card.collie";
import Navigation from "@/components/Navigation.collie";

export default function Home() {
  const [count, setCount] = useState(0);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "https://github.com/yourusername/collie", label: "GitHub" }
  ];

  return (
    <>
      <Navigation links={navLinks} />

      <main className="min-h-screen p-8">
        <Welcome showButton={true} onButtonClick={() => setCount((prev) => prev + 1)} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-6xl mx-auto">
          <Card title="Fast Compilation" footer="Powered by @collie-lang/compiler">
            Collie compiles to optimized JSX at build time for maximum performance.
          </Card>

          <Card title="Type Safe" footer="Full TypeScript support">
            Get autocomplete and type checking for your Collie components.
          </Card>

          <Card title="Framework Agnostic" footer="Works with Vite and Next.js">
            Use the same Collie templates across different frameworks.
          </Card>
        </div>

        <div className="text-center mt-12">
          <p className="text-lg">Button clicked: {count} times</p>
        </div>
      </main>
    </>
  );
}
