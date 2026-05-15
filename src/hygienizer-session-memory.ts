/**
 * Hygienizer Session Memory
 * Tracks file operations and classifications during a development session
 * Prevents creating duplicate files and maintains audit trail
 */

export interface FileOperation {
  timestamp: number;
  filePath: string;
  operation: 'created' | 'classified' | 'relocated' | 'suggested' | 'analyzed';
  category: string;
  details?: string;
  success: boolean;
}

export interface SessionFileTrack {
  filePath: string;
  category: string;
  createdAt: number;
  status: 'created' | 'pending_relocation' | 'relocated' | 'verified';
  currentLocation: string;
  suggestedLocation?: string;
  requiresApproval: boolean;
}

export interface HygienizSessionState {
  sessionId: string;
  startTime: number;
  endTime?: number;
  filesCreated: SessionFileTrack[];
  filesRelocated: Array<{
    source: string;
    destination: string;
    timestamp: number;
    gitHash?: string;
  }>;
  auditsSuggested: number;
  cleanupPlansGenerated: number;
  totalIssuesFound: number;
  hygieneScoreAtEnd?: number;
  operations: FileOperation[];
}

/**
 * Session memory manager for Hygienizer operations
 */
export class HygienizSessionMemory {
  private sessionState: HygienizSessionState;
  private filePaths: Set<string> = new Set();

  constructor(sessionId: string) {
    this.sessionState = {
      sessionId,
      startTime: Date.now(),
      filesCreated: [],
      filesRelocated: [],
      auditsSuggested: 0,
      cleanupPlansGenerated: 0,
      totalIssuesFound: 0,
      operations: [],
    };
  }

  /**
   * Track a new file creation with classification
   */
  trackFileCreation(
    filePath: string,
    category: string,
    requiresApproval: boolean = false
  ): SessionFileTrack {
    const track: SessionFileTrack = {
      filePath,
      category,
      createdAt: Date.now(),
      status: 'created',
      currentLocation: filePath,
      requiresApproval,
    };

    this.sessionState.filesCreated.push(track);
    this.filePaths.add(filePath);

    this.recordOperation({
      filePath,
      operation: 'created',
      category,
      success: true,
      timestamp: Date.now(),
    });

    return track;
  }

  /**
   * Check if a file was already created in this session
   */
  isFileAlreadyCreated(filePath: string): boolean {
    return this.filePaths.has(filePath);
  }

  /**
   * Track file relocation
   */
  trackRelocation(source: string, destination: string, gitHash?: string): void {
    this.sessionState.filesRelocated.push({
      source,
      destination,
      timestamp: Date.now(),
      gitHash,
    });

    // Update the file track status
    const fileTrack = this.sessionState.filesCreated.find((f) => f.filePath === source);
    if (fileTrack) {
      fileTrack.status = 'relocated';
      fileTrack.currentLocation = destination;
    }

    this.recordOperation({
      filePath: source,
      operation: 'relocated',
      category: 'relocation',
      details: `Moved to ${destination}`,
      success: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Track audit suggestion
   */
  trackAuditSuggestion(filePath: string, suggestedLocation: string): void {
    const fileTrack = this.sessionState.filesCreated.find((f) => f.filePath === filePath);
    if (fileTrack) {
      fileTrack.suggestedLocation = suggestedLocation;
      fileTrack.status = 'pending_relocation';
    }

    this.sessionState.auditsSuggested++;

    this.recordOperation({
      filePath,
      operation: 'suggested',
      category: 'suggestion',
      details: `Suggested location: ${suggestedLocation}`,
      success: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a classified file
   */
  recordClassification(filePath: string, category: string): void {
    // Update existing track if found
    const existing = this.sessionState.filesCreated.find((f) => f.filePath === filePath);
    if (existing) {
      existing.category = category;
    }

    this.recordOperation({
      filePath,
      operation: 'classified',
      category,
      success: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Record cleanup plan generation
   */
  recordCleanupPlan(issuesFound: number): void {
    this.sessionState.cleanupPlansGenerated++;
    this.sessionState.totalIssuesFound += issuesFound;

    this.recordOperation({
      filePath: 'repository',
      operation: 'analyzed',
      category: 'cleanup_plan',
      details: `Found ${issuesFound} issues`,
      success: true,
      timestamp: Date.now(),
    });
  }

  /**
   * Record a failed operation
   */
  recordFailure(filePath: string, operation: string, error: string): void {
    this.recordOperation({
      filePath,
      operation: operation as any,
      category: 'error',
      details: error,
      success: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Get current session state
   */
  getSessionState(): HygienizSessionState {
    return this.sessionState;
  }

  /**
   * Get summary of session
   */
  getSummary(): {
    filesCreated: number;
    filesRelocated: number;
    suggestionsProvided: number;
    issuesFound: number;
    operationCount: number;
  } {
    return {
      filesCreated: this.sessionState.filesCreated.length,
      filesRelocated: this.sessionState.filesRelocated.length,
      suggestionsProvided: this.sessionState.auditsSuggested,
      issuesFound: this.sessionState.totalIssuesFound,
      operationCount: this.sessionState.operations.length,
    };
  }

  /**
   * Get files that require approval
   */
  getFilesRequiringApproval(): SessionFileTrack[] {
    return this.sessionState.filesCreated.filter((f) => f.requiresApproval);
  }

  /**
   * Finalize session (call at session end)
   */
  endSession(hygieneScore?: number): void {
    this.sessionState.endTime = Date.now();
    this.sessionState.hygieneScoreAtEnd = hygieneScore;
  }

  /**
   * Get operations log
   */
  getOperations(): FileOperation[] {
    return this.sessionState.operations;
  }

  /**
   * Record an operation in the log
   */
  recordOperation(op: Omit<FileOperation, 'timestamp'> & { timestamp?: number }): void {
    this.sessionState.operations.push({
      ...op,
      timestamp: op.timestamp || Date.now(),
    } as FileOperation);

    // Keep only last 1000 operations to prevent memory bloat
    if (this.sessionState.operations.length > 1000) {
      this.sessionState.operations = this.sessionState.operations.slice(-1000);
    }
  }
}

/**
 * Global session memory store (one per session)
 */
const sessionMemoryStore = new Map<string, HygienizSessionMemory>();

export function createSessionMemory(sessionId: string): HygienizSessionMemory {
  const memory = new HygienizSessionMemory(sessionId);
  sessionMemoryStore.set(sessionId, memory);
  return memory;
}

export function getSessionMemory(sessionId: string): HygienizSessionMemory | undefined {
  return sessionMemoryStore.get(sessionId);
}

export function deleteSessionMemory(sessionId: string): void {
  sessionMemoryStore.delete(sessionId);
}

export function getAllSessions(): Map<string, HygienizSessionMemory> {
  return new Map(sessionMemoryStore);
}
