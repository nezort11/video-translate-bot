/**
 * Extract user_id and event_time from Telegram Update objects
 * Following priority order from spec:
 * 1. message.from.id + message.date
 * 2. edited_message.from.id + edited_message.edit_date
 * 3. callback_query.from.id + callback_query.message.date
 * 4. inline_query.from.id + inline_query.date
 * 5. chosen_inline_result.from.id
 * 6. my_chat_member.from.id
 * 7. channel_post: skip (no from)
 * 8. fallback to ingested_at or Date.now()
 */

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TelegramUser;
    date: number;
    chat: { id: number; type: string };
    text?: string;
  };
  edited_message?: {
    message_id: number;
    from?: TelegramUser;
    edit_date: number;
    date: number;
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: { date: number };
    data?: string;
  };
  inline_query?: {
    id: string;
    from: TelegramUser;
    query: string;
    date?: number;
  };
  chosen_inline_result?: {
    result_id: string;
    from: TelegramUser;
    query: string;
  };
  my_chat_member?: {
    from: TelegramUser;
    date: number;
  };
  channel_post?: any;
  [key: string]: any;
}

export interface ExtractedEvent {
  userId: number;
  eventTime: Date;
  updateId: number;
  updateType: string;
}

/**
 * Extract user_id and event_time from a single Telegram update
 * Returns null if update should be skipped (no user, or is bot)
 */
export const extractEvent = (
  updateId: number,
  updateData: string | object
): ExtractedEvent | null => {
  let update: TelegramUpdate;

  try {
    update =
      typeof updateData === "string" ? JSON.parse(updateData) : updateData;
  } catch (error) {
    console.warn(`[extractor] Failed to parse update ${updateId}:`, error);
    return null;
  }

  let userId: number | null = null;
  let eventTime: number | null = null;
  let updateType = "unknown";

  // 1. message
  if (update.message?.from && !update.message.from.is_bot) {
    userId = update.message.from.id;
    eventTime = update.message.date;
    updateType = "message";
  }
  // 2. edited_message
  else if (update.edited_message?.from && !update.edited_message.from.is_bot) {
    userId = update.edited_message.from.id;
    eventTime = update.edited_message.edit_date || update.edited_message.date;
    updateType = "edited_message";
  }
  // 3. callback_query
  else if (update.callback_query?.from && !update.callback_query.from.is_bot) {
    userId = update.callback_query.from.id;
    eventTime = update.callback_query.message?.date || null;
    updateType = "callback_query";
  }
  // 4. inline_query
  else if (update.inline_query?.from && !update.inline_query.from.is_bot) {
    userId = update.inline_query.from.id;
    eventTime = update.inline_query.date || null;
    updateType = "inline_query";
  }
  // 5. chosen_inline_result
  else if (
    update.chosen_inline_result?.from &&
    !update.chosen_inline_result.from.is_bot
  ) {
    userId = update.chosen_inline_result.from.id;
    updateType = "chosen_inline_result";
  }
  // 6. my_chat_member
  else if (update.my_chat_member?.from && !update.my_chat_member.from.is_bot) {
    userId = update.my_chat_member.from.id;
    eventTime = update.my_chat_member.date || null;
    updateType = "my_chat_member";
  }
  // 7. channel_post - skip
  else if (update.channel_post) {
    return null;
  }

  // Skip if no user found
  if (userId === null) {
    return null;
  }

  // Fallback event time to now if not found
  const eventDate = eventTime
    ? new Date(eventTime * 1000) // Telegram timestamps are in seconds
    : new Date();

  return {
    userId,
    eventTime: eventDate,
    updateId,
    updateType,
  };
};

/**
 * Extract events from multiple updates
 */
export const extractEvents = (
  updates: Array<{ update_id: number; update_data: string }>
): ExtractedEvent[] => {
  const events: ExtractedEvent[] = [];

  for (const update of updates) {
    const event = extractEvent(update.update_id, update.update_data);
    if (event) {
      events.push(event);
    }
  }

  return events;
};

/**
 * Group events by user and compute aggregations
 */
export interface UserStats {
  userId: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  messagesCount: number;
}

export const aggregateByUser = (events: ExtractedEvent[]): UserStats[] => {
  const userMap = new Map<
    number,
    { firstSeen: Date; lastSeen: Date; count: number }
  >();

  for (const event of events) {
    const existing = userMap.get(event.userId);

    if (existing) {
      existing.count++;
      if (event.eventTime < existing.firstSeen) {
        existing.firstSeen = event.eventTime;
      }
      if (event.eventTime > existing.lastSeen) {
        existing.lastSeen = event.eventTime;
      }
    } else {
      userMap.set(event.userId, {
        firstSeen: event.eventTime,
        lastSeen: event.eventTime,
        count: 1,
      });
    }
  }

  return Array.from(userMap.entries()).map(([userId, stats]) => ({
    userId,
    firstSeenAt: stats.firstSeen,
    lastSeenAt: stats.lastSeen,
    messagesCount: stats.count,
  }));
};

/**
 * Filter events within a date range
 */
export const filterByDateRange = (
  events: ExtractedEvent[],
  from?: Date,
  to?: Date
): ExtractedEvent[] => {
  return events.filter((event) => {
    if (from && event.eventTime < from) return false;
    if (to && event.eventTime > to) return false;
    return true;
  });
};

/**
 * Get unique user IDs from events
 */
export const getUniqueUserIds = (events: ExtractedEvent[]): number[] => {
  return [...new Set(events.map((e) => e.userId))];
};

/**
 * Count new users (first seen within date range)
 */
export const countNewUsers = (
  allEvents: ExtractedEvent[],
  from: Date,
  to: Date
): number => {
  // Find first seen date for each user
  const firstSeenMap = new Map<number, Date>();

  for (const event of allEvents) {
    const existing = firstSeenMap.get(event.userId);
    if (!existing || event.eventTime < existing) {
      firstSeenMap.set(event.userId, event.eventTime);
    }
  }

  // Count users whose first seen is within the range
  let count = 0;
  for (const [, firstSeen] of firstSeenMap) {
    if (firstSeen >= from && firstSeen <= to) {
      count++;
    }
  }

  return count;
};

/**
 * Group new users by day
 */
export interface DailyNewUsers {
  date: string; // YYYY-MM-DD
  count: number;
}

export const groupNewUsersByDay = (
  allEvents: ExtractedEvent[],
  from: Date,
  to: Date
): DailyNewUsers[] => {
  // Find first seen date for each user
  const firstSeenMap = new Map<number, Date>();

  for (const event of allEvents) {
    const existing = firstSeenMap.get(event.userId);
    if (!existing || event.eventTime < existing) {
      firstSeenMap.set(event.userId, event.eventTime);
    }
  }

  // Group by day
  const dayMap = new Map<string, number>();

  for (const [, firstSeen] of firstSeenMap) {
    if (firstSeen >= from && firstSeen <= to) {
      const dayKey = firstSeen.toISOString().split("T")[0];
      dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + 1);
    }
  }

  // Fill in missing days with 0
  const result: DailyNewUsers[] = [];
  const current = new Date(from);

  while (current <= to) {
    const dayKey = current.toISOString().split("T")[0];
    result.push({
      date: dayKey,
      count: dayMap.get(dayKey) || 0,
    });
    current.setDate(current.getDate() + 1);
  }

  return result;
};

