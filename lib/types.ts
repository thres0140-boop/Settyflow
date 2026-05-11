export type ThreadStatus = "new" | "qualified" | "call_booked" | "closed";

export interface ThreadListItem {
  id: number;
  account: {
    id: number;
    handle: string | null;
    displayName: string | null;
    profilePicUrl: string | null;
    color: string;
  };
  leadName: string;
  leadHandle: string | null;
  leadProfilePic: string | null;
  status: ThreadStatus;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageFromMe: boolean;
}
