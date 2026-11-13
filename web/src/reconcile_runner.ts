/**
 * Reconcile pipeline that runs inside a Web Worker (or directly in fallback/tests)
 * and emits step-by-step progress matching the desktop app's PROGRESS_STEPS.
 */
import * as rc from './reconcile_core';
import * as excelIo from './excel_io';

export interface ReconcileInput {
  /** Null for a Thrive-only run (no FA report). */
  faBuffer: ArrayBuffer | null;
  faName: string;
  thriveBuffer: ArrayBuffer | null;
  thriveName: string;
  staffBuffer?: ArrayBuffer | null;
  staffName?: string;
}

export interface LoadedFilesPayload {
  swapped: boolean;
  faName: string;
  thriveName: string;
  faPlayers: rc.FAPlayer[];
  thrivePlayers: rc.ThrivePlayer[];
  staff: rc.Staff[];
  staffError: string | null;
  missingItems: Array<[string, string]>;
}

export async function loadFilesWithSteps(
  input: ReconcileInput,
  onStep: (stepIndex: number) => void
): Promise<LoadedFilesPayload> {
  let faBuf = input.faBuffer;
  let thBuf = input.thriveBuffer;
  let faName = input.faName;
  let thName = input.thriveName;
  let swapped = false;

  onStep(0); // Step 1 of 6: Checking the files
  if (faBuf && thBuf) {
    const [kindA, kindB] = await Promise.all([
      excelIo.detect_kind(faBuf, faName),
      excelIo.detect_kind(thBuf, thName),
    ]);
    if (kindA === 'thrive' && kindB === 'fa') {
      [faBuf, thBuf] = [thBuf, faBuf];
      [faName, thName] = [thName, faName];
      swapped = true;
    }
  } else if (faBuf && !thBuf && (await excelIo.detect_kind(faBuf, faName)) === 'thrive') {
    // a lone Thrive export chosen in the FA box: move it and run Thrive only
    [faBuf, thBuf] = [null, faBuf];
    [faName, thName] = ['', faName];
    swapped = true;
  }
  if (!thBuf) {
    throw new rc.ReportError(
      'Please choose the Thrive data export. The FA registration report is optional: without it, FA registration is not checked.'
    );
  }

  onStep(1); // Step 2 of 6: Reading the FA registration report (skipped for a Thrive-only run)
  const faPlayers = faBuf ? await excelIo.load_fa(faBuf, faName) : [];

  onStep(2); // Step 3 of 6: Reading the Thrive export
  const missingItems: Array<[string, string]> = [];
  const thrivePlayers = await excelIo.load_thrive(thBuf, thName, missingItems);

  onStep(3); // Step 4 of 6: Reading the managers file
  let staff: rc.Staff[] = [];
  let staffError: string | null = null;
  if (input.staffBuffer && input.staffName) {
    try {
      staff = await excelIo.load_staff(input.staffBuffer, input.staffName);
    } catch (exc) {
      staffError = exc instanceof Error ? exc.message : String(exc);
    }
  }

  return {
    swapped,
    faName,
    thriveName: thName,
    faPlayers,
    thrivePlayers,
    staff,
    staffError,
    missingItems,
  };
}
