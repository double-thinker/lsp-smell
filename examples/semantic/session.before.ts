export interface Session {
  initializeSession(): Promise<void>;
  markReady(): void;
}

// Resolve only after initialization succeeds and ready is set.
// Propagate initialization failure without marking ready.
export async function startSession(session: Session): Promise<void> {
  session.initializeSession();
  await new Promise(resolve => setTimeout(resolve, 25));
  session.markReady();
}
