/**
 * Time utility functions to replace moment.js
 * These are lightweight alternatives that cover all the time operations needed.
 */

/**
 * Duration utility - convert various time units to milliseconds
 */
export const duration = {
  /** Convert seconds to milliseconds */
  seconds: (value: number): number => value * 1000,

  /** Convert minutes to milliseconds */
  minutes: (value: number): number => value * 60 * 1000,

  /** Convert hours to milliseconds */
  hours: (value: number): number => value * 60 * 60 * 1000,

  /** Convert days to milliseconds */
  days: (value: number): number => value * 24 * 60 * 60 * 1000,
};

/**
 * Convert various time units to seconds
 */
export const toSeconds = {
  /** Convert minutes to seconds */
  fromMinutes: (minutes: number): number => minutes * 60,

  /** Convert hours to seconds */
  fromHours: (hours: number): number => hours * 60 * 60,

  /** Convert milliseconds to seconds */
  fromMilliseconds: (ms: number): number => ms / 1000,
};

/**
 * Convert various time units from seconds
 */
export const fromSeconds = {
  /** Convert seconds to minutes (rounded up) */
  toMinutes: (seconds: number): number => seconds / 60,

  /** Convert seconds to hours */
  toHours: (seconds: number): number => seconds / 60 / 60,

  /** Convert seconds to milliseconds */
  toMilliseconds: (seconds: number): number => seconds * 1000,
};

/**
 * Calculate the difference between two dates in various units
 */
export const diff = {
  /** Get difference in milliseconds */
  inMilliseconds: (date1: Date, date2: Date): number =>
    date1.getTime() - date2.getTime(),

  /** Get difference in seconds */
  inSeconds: (date1: Date, date2: Date): number =>
    Math.floor((date1.getTime() - date2.getTime()) / 1000),

  /** Get difference in minutes */
  inMinutes: (date1: Date, date2: Date): number =>
    Math.floor((date1.getTime() - date2.getTime()) / (60 * 1000)),

  /** Get difference in hours */
  inHours: (date1: Date, date2: Date): number =>
    Math.floor((date1.getTime() - date2.getTime()) / (60 * 60 * 1000)),
};

/**
 * Subtract time from a date
 */
export const subtract = {
  /** Subtract hours from a date */
  hours: (date: Date, hours: number): Date =>
    new Date(date.getTime() - duration.hours(hours)),

  /** Subtract minutes from a date */
  minutes: (date: Date, minutes: number): Date =>
    new Date(date.getTime() - duration.minutes(minutes)),

  /** Subtract seconds from a date */
  seconds: (date: Date, seconds: number): Date =>
    new Date(date.getTime() - duration.seconds(seconds)),
};

/**
 * Format a duration (in seconds) as HH:mm:ss or H:mm:ss
 * @param seconds Total seconds to format
 * @returns Formatted time string (e.g., "1:23:45" or "0:05:30")
 */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const pad = (num: number) => String(num).padStart(2, "0");

  return `${hours}:${pad(minutes)}:${pad(secs)}`;
};

/**
 * Check if a date is valid
 */
export const isValidDate = (date: any): boolean => {
  return date instanceof Date && !isNaN(date.getTime());
};
