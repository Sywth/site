import { useState } from "react";
import ShaderCanvas from "./ShaderCanvas";

const GlassBox: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = "",
  children,
}) => (
  <div
    className={`
      px-6 py-4
      backdrop-saturate-150
      shadow-lg
      font-mono
      text-white
      w-80
      ${className}
    `}
  >
    {children}
  </div>
);

const TextOverlay = () => (
  <GlassBox>
    <div className="mb-2 font-semibold tracking-wide">Seth Perera</div>
    <div className="flex justify-between font-bold">UCL</div>
    <div className="flex justify-between">
      <span>BSc Computer Science</span>
      <span className="text-right">2025</span>
    </div>
  </GlassBox>
);

const ContactInfo = () => (
  <GlassBox className="mt-4">
    <div className="font-semibold">Contact</div>
    <div className="hover:underline hover:font-bold">
      <a target="_blank" href="https://github.com/Sywth">
        GitHub
      </a>
    </div>
    <div className="hover:underline hover:font-bold">
      <a target="_blank" href="https://www.linkedin.com/in/sp-ucl/">
        LinkedIn
      </a>
    </div>
  </GlassBox>
);

const PortfolioInfo = () => {
  return (
    // flexbox with no pointer events for centering widgets
    <div
      className="
          fixed inset-0 
          flex flex-col items-center
          md:items-start
          pointer-events-none
        "
    >
      <div className="mt-8 md:ml-8 pointer-events-auto">
        <TextOverlay />
        <ContactInfo />
      </div>
    </div>
  );
};

const App = () => {
  return (
    <>
      <ShaderCanvas />
      <PortfolioInfo />
    </>
  );
};

export default App;
