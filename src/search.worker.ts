/// <reference lib="webworker" />
import { solveNetwork } from "./graph";
self.onmessage = ({ data }) => {
  try {
    const result = solveNetwork(data.network, data.points, data.objective);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error
          ? error.message
          : "Could not find a meeting point.",
    });
  }
};
