import { useEffect, useRef, useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setTimeout(() => setCount((count) => count + 1), 1000);
  }, [count]);

  return <p className="read-the-docs">Your score is {count}</p>;
}

export default App;
