/**
 * Web Worker entry point so file parsing stays off the main UI thread (#18).
 */
import { loadFilesWithSteps, ReconcileInput } from './reconcile_runner';
import * as rc from './reconcile_core';

self.onmessage = async (event: MessageEvent<ReconcileInput>) => {
  try {
    const loaded = await loadFilesWithSteps(event.data, (stepIndex) => {
      self.postMessage({ type: 'step', stepIndex });
    });
    self.postMessage({ type: 'loaded', payload: loaded });
  } catch (exc) {
    if (exc instanceof rc.ReportError) {
      self.postMessage({
        type: 'error',
        message: `${exc.message}\n\nCheck each file is in the right box. Help > Getting the exports has the full steps.`,
      });
    } else {
      const msg = exc instanceof Error ? exc.message : String(exc);
      self.postMessage({
        type: 'error',
        message: `Something went wrong reading the files:\n${msg}`,
      });
    }
  }
};
