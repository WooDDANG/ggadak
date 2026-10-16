import { DeliveryPolicy, positiveIntegerSetting } from '@ggaddak/shared';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const budgets = new Map<string, { bytes: number; ready: Promise<void> }>();
async function size(directory: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await size(path);
    else {
      try {
        total += (await stat(path)).size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  return total;
}
/** One Bot process owns the journal; all service instances share its byte budget. */
export class JournalBudget {
  private state: { bytes: number; ready: Promise<void> };
  private max: number;
  constructor(private directory: string) {
    this.max = positiveIntegerSetting(
      process.env,
      'BOT_JOURNAL_MAX_BYTES',
      DeliveryPolicy.journalBytes,
    );
    if (!Number.isSafeInteger(this.max) || this.max < 1)
      throw new Error('Invalid BOT_JOURNAL_MAX_BYTES');
    let state = budgets.get(directory);
    if (!state) {
      state = { bytes: 0, ready: Promise.resolve() };
      const initial = state;
      state.ready = size(directory).then(bytes => {
        initial.bytes = bytes;
      });
      budgets.set(directory, state);
    }
    this.state = state;
  }
  async reserve(delta: number, newData: boolean) {
    await this.state.ready;
    // Leave ten percent for receipts, result acknowledgements and cleanup metadata.
    if (
      newData &&
      this.state.bytes + Math.max(0, delta) > Math.floor(this.max * DeliveryPolicy.dataBudgetRatio)
    )
      throw new Error('Bot journal capacity exceeded; adjust limits or clean confirmed data');
    this.state.bytes = Math.max(0, this.state.bytes + delta);
  }
  async usage() {
    await this.state.ready;
    return { usedBytes: this.state.bytes, maxBytes: this.max };
  }
}
