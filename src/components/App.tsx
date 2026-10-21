import type { ReactNode } from "react";
import ShaderCanvas from "./ShaderCanvas";

const GlassBox = ({ children }: { children: ReactNode }) => (
  <div className="w-80 px-6 py-4 backdrop-saturate-150 shadow-lg font-mono text-white">
    {children}
  </div>
);

const App = () => (
  <>
    <ShaderCanvas />
    <div className="fixed inset-0 flex flex-col items-center md:items-start pointer-events-none">
      <div className="mt-8 md:ml-8 space-y-4 pointer-events-auto">
        <GlassBox>
          <div className="mb-2 font-semibold tracking-wide">Seth Perera</div>
          <div className="font-bold">UCL</div>
          <div className="flex justify-between">
            <span>BSc Computer Science</span>
            <span className="text-right">2025</span>
          </div>
        </GlassBox>

        <GlassBox>
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
          <div className="hover:underline hover:font-bold">
            <a target="_blank" href="https://github.com/Sywth/site">
              Source Code
            </a>
          </div>
        </GlassBox>
      </div>
    </div>
  </>
);

export default App;
