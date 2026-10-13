/** Shared by every service instance in this Bot process. Waiting retries never hold a slot. */
export class ChannelScheduler {
  private tails = new Map<string, Promise<void>>();

  run<T>(channelId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(channelId) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(
      () => {},
      () => {},
    );
    this.tails.set(channelId, tail);
    void tail.then(() => {
      if (this.tails.get(channelId) === tail) this.tails.delete(channelId);
    });
    return result;
  }
}

export const analysisScheduler = new ChannelScheduler();
